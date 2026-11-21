import { type KeyObject, verify } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestJson, signJwt } from '../api';
import { createStoreKeys, stubFetch } from './helpers';

const keys = createStoreKeys();

function decode(part: string) {
  return JSON.parse(Buffer.from(part, 'base64url').toString());
}

/** Header and claims of a token whose signature the public key verifies */
function verifyJwt(token: string, publicKey: KeyObject) {
  const [header, payload, signature] = token.split('.');
  const valid = verify(
    'sha256',
    Buffer.from(`${header}.${payload}`),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signature, 'base64url'),
  );
  expect(valid).toBe(true);
  return { header: decode(header), claims: decode(payload) };
}

describe('signJwt', () => {
  it('signs an RS256 token with an RSA key', () => {
    const token = signJwt('RS256', keys.rsaPrivateKey, { iss: 'me' });

    const { header, claims } = verifyJwt(token, keys.rsaPublicKey);
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(claims).toEqual({
      iss: 'me',
      iat: expect.any(Number),
      exp: claims.iat + 300,
    });
  });

  it('signs an ES256 token with an EC key and names the key id', () => {
    const token = signJwt('ES256', keys.ecPrivateKey, { iss: 'me' }, 'KEY123');

    const { header } = verifyJwt(token, keys.ecPublicKey);
    expect(header).toEqual({ alg: 'ES256', typ: 'JWT', kid: 'KEY123' });
    // Raw r and s of P-256, not a DER sequence
    expect(Buffer.from(token.split('.')[2], 'base64url')).toHaveLength(64);
  });

  it('rejects a key that is not of the type the algorithm needs', () => {
    expect(() => signJwt('ES256', 'secret-content', {})).toThrow(
      /^Invalid private key for ES256 signing: expected a PEM encoded EC key$/,
    );
    expect(() => signJwt('RS256', keys.ecPrivateKey, {})).toThrow(
      'Invalid private key for RS256 signing: expected a PEM encoded RSA key',
    );
  });
});

describe('requestJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed response', async () => {
    const calls = stubFetch({ 'GET https://example.com/a?b=1': { c: 2 } });

    await expect(
      requestJson('https://example.com/a?b=1', { headers: { X: 'y' } }),
    ).resolves.toEqual({ c: 2 });
    expect(calls).toEqual([
      { request: 'GET https://example.com/a?b=1', headers: { X: 'y' } },
    ]);
  });

  it('returns an empty object for an empty response', async () => {
    stubFetch({
      'DELETE https://example.com/a': new Response(null, { status: 204 }),
    });

    await expect(
      requestJson('https://example.com/a', { method: 'DELETE' }),
    ).resolves.toEqual({});
  });

  it('fails with the status and body, which it also passes to log', async () => {
    stubFetch({
      'GET https://example.com/a?token=1': new Response(' not allowed\n', {
        status: 403,
      }),
    });
    const log = vi.fn();

    await expect(
      requestJson('https://example.com/a?token=1', {}, log),
    ).rejects.toThrow(
      /^GET https:\/\/example\.com\/a failed with status 403: not allowed$/,
    );
    expect(log.mock.calls).toEqual([
      ['GET https://example.com/a: 403\nnot allowed'],
    ]);
  });

  it('fails with the cause of a network error', async () => {
    vi.stubGlobal('fetch', async () => {
      throw Object.assign(new TypeError('fetch failed'), {
        cause: new Error('getaddrinfo ENOTFOUND example.com'),
      });
    });

    await expect(
      requestJson('https://example.com/a', { method: 'POST' }),
    ).rejects.toThrow(
      'POST https://example.com/a failed: getaddrinfo ENOTFOUND example.com',
    );
  });
});
