import { type Log, requestJson, signJwt } from './api';
import { uniqueAscending } from './utils';

const API = 'https://api.appstoreconnect.apple.com';

/** Build attributes to request: the build number, and the rest for log */
const BUILD_FIELDS = 'version,uploadedDate,processingState,expired';

/** App Store Connect API team key */
export interface AppStoreKey {
  keyId: string;
  issuerId: string;
  /** Content of the .p8 file */
  privateKey: string;
}

interface Page<T> {
  data: T[];
  links?: { next?: string };
}

interface App {
  id: string;
  attributes: { bundleId: string };
}

interface Build {
  attributes: { version: string };
}

/**
 * Resources of all pages of a list request.
 */
async function getAll<T>(
  path: string,
  query: Record<string, string>,
  headers: Record<string, string>,
  log?: Log,
): Promise<T[]> {
  const resources: T[] = [];
  let url: string | undefined = `${API}${path}?${new URLSearchParams(query)}`;
  while (url) {
    const page: Page<T> = await requestJson(url, { headers }, log);
    resources.push(...page.data);
    url = page.links?.next;
  }
  return resources;
}

/**
 * Version codes (build numbers, CFBundleVersion) of the builds App Store
 * Connect holds for an app, in ascending order. Expired builds are
 * included. Build numbers that are not plain integers, such as "1.2.3", are
 * left out.
 *
 * @param bundleId Bundle identifier of the app
 * @param key API key whose role allows listing the app's builds
 * @param log Receives the requests and their raw responses
 */
export async function getAppStoreVersionCodes(
  bundleId: string,
  key: AppStoreKey,
  log?: Log,
): Promise<number[]> {
  const token = signJwt(
    'ES256',
    key.privateKey,
    { iss: key.issuerId, aud: 'appstoreconnect-v1' },
    key.keyId,
  );
  const headers = { Authorization: `Bearer ${token}` };

  const apps = await getAll<App>(
    '/v1/apps',
    { 'filter[bundleId]': bundleId, 'fields[apps]': 'bundleId', limit: '200' },
    headers,
    log,
  );
  // The filter may also return apps whose bundle id only starts with the value
  const app = apps.find(({ attributes }) => attributes.bundleId === bundleId);
  if (!app) {
    throw new Error(
      `No app with bundle id "${bundleId}" found in App Store Connect`,
    );
  }

  const builds = await getAll<Build>(
    '/v1/builds',
    { 'filter[app]': app.id, 'fields[builds]': BUILD_FIELDS, limit: '200' },
    headers,
    log,
  );
  return uniqueAscending(
    builds
      .map(({ attributes }) => attributes.version)
      .filter((version) => /^\d+$/.test(version))
      .map(Number),
  );
}
