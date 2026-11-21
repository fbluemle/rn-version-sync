import { type KeyObject, createPrivateKey, sign } from 'node:crypto';

/** Seconds a signed token stays valid */
const TOKEN_LIFETIME = 300;

/** Milliseconds after which a request is abandoned */
const REQUEST_TIMEOUT = 30_000;

/** Key type each signing algorithm requires */
const KEY_TYPES = { RS256: 'rsa', ES256: 'ec' } as const;

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * Sign a short-lived JWT with a PEM encoded private key: an RSA key for
 * RS256, an EC P-256 key for ES256. The iat and exp claims are added.
 */
export function signJwt(
  algorithm: keyof typeof KEY_TYPES,
  privateKey: string,
  claims: Record<string, string>,
  keyId?: string,
): string {
  let key: KeyObject | undefined;
  try {
    key = createPrivateKey(privateKey);
  } catch {
    // Reported below, without the parser's message
  }
  if (key?.asymmetricKeyType !== KEY_TYPES[algorithm]) {
    throw new Error(
      `Invalid private key for ${algorithm} signing: expected a PEM encoded ${KEY_TYPES[algorithm].toUpperCase()} key`,
    );
  }

  const iat = Math.floor(Date.now() / 1000);
  const header = {
    alg: algorithm,
    typ: 'JWT',
    ...(keyId !== undefined && { kid: keyId }),
  };
  const payload = { ...claims, iat, exp: iat + TOKEN_LIFETIME };
  const input = `${encode(header)}.${encode(payload)}`;

  // JWT wants an ECDSA signature as the raw r and s values, not as DER.
  // The option has no effect on RSA signatures.
  const signature = sign('sha256', Buffer.from(input), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `${input}.${signature.toString('base64url')}`;
}

/** Receives a request with the status and raw body of its response */
export type Log = (message: string) => void;

/**
 * Send a request and parse the JSON response; an empty response yields an
 * empty object. A network failure or a status outside 2xx is an error that
 * names the request, without its query string, and carries the response
 * body. With log, every response is passed to it, so it must not be given
 * for a request that returns a secret.
 */
export async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  log?: Log,
): Promise<T> {
  const request = `${init.method ?? 'GET'} ${url.split('?')[0]}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
  } catch (error) {
    const { message, cause } = error as Error & { cause?: unknown };
    throw new Error(
      `${request} failed: ${cause instanceof Error ? cause.message : message}`,
    );
  }

  const body = await response.text();
  log?.(`${request}: ${response.status}\n${body.trim()}`);
  if (!response.ok) {
    throw new Error(
      `${request} failed with status ${response.status}: ${body.trim()}`,
    );
  }
  return (body ? JSON.parse(body) : {}) as T;
}
