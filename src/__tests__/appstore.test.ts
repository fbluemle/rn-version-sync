import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppStoreVersionCodes } from '../appstore';
import {
  APP_STORE_API,
  appStoreAppsUrl,
  appStoreBuildsUrl,
  appStoreRoutes,
  createStoreKeys,
  stubFetch,
} from './helpers';

const keys = createStoreKeys();

describe('getAppStoreVersionCodes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the integer build numbers in ascending order', async () => {
    stubFetch(
      appStoreRoutes('com.example.app', ['10203', '9', '1.2.3', '8b', '9']),
    );

    await expect(
      getAppStoreVersionCodes('com.example.app', keys.appStoreKey),
    ).resolves.toEqual([9, 10203]);
  });

  it('follows the links to further pages', async () => {
    const next = `${APP_STORE_API}/v1/builds?cursor=abc&limit=200`;
    const calls = stubFetch({
      ...appStoreRoutes('com.example.app', []),
      [`GET ${appStoreBuildsUrl('42')}`]: {
        data: [{ attributes: { version: '2' } }],
        links: { next },
      },
      [`GET ${next}`]: {
        data: [{ attributes: { version: '1' } }],
        links: { self: next },
      },
    });

    await expect(
      getAppStoreVersionCodes('com.example.app', keys.appStoreKey),
    ).resolves.toEqual([1, 2]);
    expect(calls.map((call) => call.request)).toEqual([
      `GET ${appStoreAppsUrl('com.example.app')}`,
      `GET ${appStoreBuildsUrl('42')}`,
      `GET ${next}`,
    ]);
  });

  it('selects the app whose bundle id matches exactly', async () => {
    const calls = stubFetch({
      [`GET ${appStoreAppsUrl('com.example.app')}`]: {
        data: [
          { id: '1', attributes: { bundleId: 'com.example.app.staging' } },
          { id: '2', attributes: { bundleId: 'com.example.app' } },
        ],
      },
      [`GET ${appStoreBuildsUrl('2')}`]: {
        data: [{ attributes: { version: '5' } }],
      },
    });

    await expect(
      getAppStoreVersionCodes('com.example.app', keys.appStoreKey),
    ).resolves.toEqual([5]);
    expect(calls).toHaveLength(2);
  });

  it('fails when no app has the bundle id', async () => {
    stubFetch({
      [`GET ${appStoreAppsUrl('com.example.app')}`]: {
        data: [
          { id: '1', attributes: { bundleId: 'com.example.app.staging' } },
        ],
      },
    });

    await expect(
      getAppStoreVersionCodes('com.example.app', keys.appStoreKey),
    ).rejects.toThrow(
      'No app with bundle id "com.example.app" found in App Store Connect',
    );
  });

  it('authorizes with a token for the API key', async () => {
    const calls = stubFetch(appStoreRoutes('com.example.app', ['1']));

    await getAppStoreVersionCodes('com.example.app', keys.appStoreKey);

    const [scheme, token] = calls[0].headers.Authorization.split(' ');
    expect(scheme).toBe('Bearer');
    expect(calls[1].headers.Authorization).toBe(`Bearer ${token}`);

    const [header, payload] = token.split('.');
    const decode = (part: string) =>
      JSON.parse(Buffer.from(part, 'base64url').toString());
    expect(decode(header)).toEqual({
      alg: 'ES256',
      typ: 'JWT',
      kid: 'KEY123',
    });
    expect(decode(payload)).toEqual({
      iss: 'issuer-1',
      aud: 'appstoreconnect-v1',
      iat: expect.any(Number),
      exp: expect.any(Number),
    });
  });
});
