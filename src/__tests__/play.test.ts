import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPlayVersionCodes } from '../play';
import {
  PLAY_API,
  TOKEN_URI,
  createStoreKeys,
  playRoutes,
  stubFetch,
} from './helpers';

const keys = createStoreKeys();
const EDITS = `${PLAY_API}/applications/com.example.app/edits`;

describe('getPlayVersionCodes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the codes of bundles and APKs, read through an edit', async () => {
    const calls = stubFetch({
      ...playRoutes('com.example.app', [10203, 10201]),
      [`GET ${EDITS}/edit1/apks`]: {
        apks: [{ versionCode: 10201 }, { versionCode: 7 }],
      },
    });

    await expect(
      getPlayVersionCodes('com.example.app', keys.serviceAccountJson),
    ).resolves.toEqual([7, 10201, 10203]);
    expect(calls.map((call) => call.request)).toEqual([
      `POST ${TOKEN_URI}`,
      `POST ${EDITS}`,
      `GET ${EDITS}/edit1/bundles`,
      `GET ${EDITS}/edit1/apks`,
      `DELETE ${EDITS}/edit1`,
    ]);
  });

  it('exchanges a signed assertion for the token it sends', async () => {
    const calls = stubFetch(playRoutes('com.example.app', [1]));

    await getPlayVersionCodes('com.example.app', keys.serviceAccountJson);

    const token = new URLSearchParams(calls[0].body);
    expect(calls[0].request).toBe(`POST ${TOKEN_URI}`);
    expect(token.get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
    );
    const [, payload] = (token.get('assertion') as string).split('.');
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      iss: 'ci@example.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: TOKEN_URI,
      iat: expect.any(Number),
      exp: expect.any(Number),
    });
    for (const call of calls.slice(1)) {
      expect(call.headers.Authorization).toBe('Bearer play-token');
    }
  });

  it('deletes the edit when a list request fails', async () => {
    const calls = stubFetch({
      ...playRoutes('com.example.app', [1]),
      [`GET ${EDITS}/edit1/apks`]: new Response('denied', { status: 403 }),
    });

    await expect(
      getPlayVersionCodes('com.example.app', keys.serviceAccountJson),
    ).rejects.toThrow(`GET ${EDITS}/edit1/apks failed with status 403: denied`);
    expect(calls[calls.length - 1].request).toBe(`DELETE ${EDITS}/edit1`);
  });

  it('ignores a failure to delete the edit', async () => {
    stubFetch({
      ...playRoutes('com.example.app', [1]),
      [`DELETE ${EDITS}/edit1`]: new Response('gone', { status: 500 }),
    });

    await expect(
      getPlayVersionCodes('com.example.app', keys.serviceAccountJson),
    ).resolves.toEqual([1]);
  });

  it('rejects a key that is not JSON or lacks a field', async () => {
    await expect(
      getPlayVersionCodes('com.example.app', 'secret-content'),
    ).rejects.toThrow(/^Service account key is not valid JSON$/);
    await expect(
      getPlayVersionCodes('com.example.app', '{"client_email":"a@b.c"}'),
    ).rejects.toThrow('Service account key has no "private_key" string');
  });
});
