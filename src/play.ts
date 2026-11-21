import { type Log, requestJson, signJwt } from './api';
import { uniqueAscending } from './utils';

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

/** Fields of a service account JSON key that are needed for a token */
const KEY_FIELDS = ['client_email', 'private_key', 'token_uri'] as const;
type ServiceAccountKey = Record<(typeof KEY_FIELDS)[number], string>;

function parseServiceAccountKey(json: string): ServiceAccountKey {
  let key: Partial<Record<string, unknown>> | null;
  try {
    key = JSON.parse(json);
  } catch {
    // The parser's message quotes the input, which is a secret
    throw new Error('Service account key is not valid JSON');
  }

  for (const field of KEY_FIELDS) {
    if (typeof key?.[field] !== 'string') {
      throw new Error(`Service account key has no "${field}" string`);
    }
  }
  return key as unknown as ServiceAccountKey;
}

async function getAccessToken(key: ServiceAccountKey): Promise<string> {
  const assertion = signJwt('RS256', key.private_key, {
    iss: key.client_email,
    scope: SCOPE,
    aud: key.token_uri,
  });
  const { access_token } = await requestJson<{ access_token: string }>(
    key.token_uri,
    {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    },
  );
  return access_token;
}

interface Binaries {
  bundles?: { versionCode: number }[];
  apks?: { versionCode: number }[];
}

/**
 * Version codes of the current app bundles and APKs of an app in Google
 * Play, in ascending order. One that a later release has replaced is no
 * longer current and is left out. They are read through an edit, which is
 * deleted again without being committed.
 *
 * @param packageName Package name (applicationId) of the app
 * @param serviceAccountJson Content of a service account JSON key with
 *   access to the app
 * @param log Receives the requests and their raw responses
 */
export async function getPlayVersionCodes(
  packageName: string,
  serviceAccountJson: string,
  log?: Log,
): Promise<number[]> {
  const key = parseServiceAccountKey(serviceAccountJson);
  const headers = { Authorization: `Bearer ${await getAccessToken(key)}` };
  const edits = `${API}/applications/${encodeURIComponent(packageName)}/edits`;

  const { id } = await requestJson<{ id: string }>(
    edits,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
    },
    log,
  );
  const edit = `${edits}/${id}`;

  try {
    const [{ bundles = [] }, { apks = [] }] = await Promise.all([
      requestJson<Binaries>(`${edit}/bundles`, { headers }, log),
      requestJson<Binaries>(`${edit}/apks`, { headers }, log),
    ]);

    return uniqueAscending(
      [...bundles, ...apks].map(({ versionCode }) => versionCode),
    );
  } finally {
    // An edit that is not committed changes nothing and expires on its own,
    // so a failed delete does not affect the result.
    await requestJson(edit, { method: 'DELETE', headers }, log).catch(() => {});
  }
}
