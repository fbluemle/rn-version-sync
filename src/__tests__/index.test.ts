import { afterEach, describe, expect, it } from 'vitest';
import {
  checkVersions,
  formatEnv,
  formatTemplate,
  readNativeValues,
  resolveVersions,
  syncVersions,
} from '../index';
import { TestProject } from './helpers';

describe('syncVersions', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('syncs both Android and iOS', () => {
    project = new TestProject({ version: '1.2.3' });

    syncVersions(project.root);

    const gradle = project.readGradle();
    expect(gradle).toContain('versionName "1.2.3"');
    expect(gradle).toContain('versionCode 10203');

    const pbxproj = project.readPbxproj();
    expect(pbxproj).toContain('MARKETING_VERSION = 1.2.3;');
    expect(pbxproj).toContain('CURRENT_PROJECT_VERSION = 10203;');
  });

  it('uses manual versionCode override', () => {
    project = new TestProject({ version: '1.2.3', ios: false });

    syncVersions(project.root, { versionCode: 999, skipIos: true });

    const gradle = project.readGradle();
    expect(gradle).toContain('versionCode 999');
  });

  it('throws on versionCode exceeding 32-bit int max', () => {
    project = new TestProject({ version: '1.0.0', android: false, ios: false });

    expect(() =>
      syncVersions(project.root, { versionCode: 2147483648 }),
    ).toThrow('exceeds maximum value');
  });

  it('is deterministic across repeated runs', () => {
    project = new TestProject({ version: '1.2.3', ios: false });

    syncVersions(project.root, { skipIos: true });
    const first = project.readGradle();

    syncVersions(project.root, { skipIos: true });
    const second = project.readGradle();

    expect(second).toBe(first);
  });

  it('uses versionName override instead of package.json', () => {
    project = new TestProject({ version: '1.0.0' });

    syncVersions(project.root, { versionName: '9.8.7' });

    const gradle = project.readGradle();
    expect(gradle).toContain('versionName "9.8.7"');
    expect(gradle).toContain('versionCode 90807');

    const pbxproj = project.readPbxproj();
    expect(pbxproj).toContain('MARKETING_VERSION = 9.8.7;');
  });

  it('allows non-semver versionName when versionCode is also provided', () => {
    project = new TestProject({ version: '1.0.0', ios: false });

    syncVersions(project.root, {
      versionName: 'custom-build',
      versionCode: 42,
      skipIos: true,
    });

    const gradle = project.readGradle();
    expect(gradle).toContain('versionName "custom-build"');
    expect(gradle).toContain('versionCode 42');
  });

  it('skips Android when skipAndroid is set', () => {
    project = new TestProject({ version: '2.0.0' });

    syncVersions(project.root, { skipAndroid: true });

    // Android should be untouched
    const gradle = project.readGradle();
    expect(gradle).toContain('versionName "1.0.0"');
    expect(gradle).toContain('versionCode 1');

    // iOS should be updated
    const pbxproj = project.readPbxproj();
    expect(pbxproj).toContain('MARKETING_VERSION = 2.0.0;');
  });

  it('skips iOS when skipIos is set', () => {
    project = new TestProject({ version: '2.0.0' });

    syncVersions(project.root, { skipIos: true });

    // Android should be updated
    const gradle = project.readGradle();
    expect(gradle).toContain('versionName "2.0.0"');

    // iOS should be untouched
    const pbxproj = project.readPbxproj();
    expect(pbxproj).toContain('MARKETING_VERSION = 1.0.0;');
  });

  it('uses explicit gradlePath', () => {
    project = new TestProject({ version: '3.0.0' });

    syncVersions(project.root, {
      gradlePath: project.gradlePath(),
      skipIos: true,
    });

    const gradle = project.readGradle();
    expect(gradle).toContain('versionName "3.0.0"');
  });

  it('uses explicit pbxprojPath', () => {
    project = new TestProject({ version: '3.0.0' });

    syncVersions(project.root, {
      pbxprojPath: project.pbxprojPath(),
      skipAndroid: true,
    });

    const pbxproj = project.readPbxproj();
    expect(pbxproj).toContain('MARKETING_VERSION = 3.0.0;');
  });

  it('reports the state of each platform after writing', () => {
    project = new TestProject({ version: '1.2.3' });

    const result = syncVersions(project.root);

    expect(result.target).toEqual({ versionName: '1.2.3', versionCode: 10203 });
    expect(result.platforms).toEqual([
      {
        platform: 'android',
        path: project.gradlePath(),
        appId: 'com.testapp',
        versionName: '1.2.3',
        versionCode: '10203',
        inSync: true,
        updated: true,
      },
      {
        platform: 'ios',
        path: project.pbxprojPath(),
        appId: 'com.testapp',
        versionName: '1.2.3',
        versionCode: '10203',
        inSync: true,
        updated: true,
      },
    ]);
  });

  it('marks platforms that were already in sync as not updated', () => {
    project = new TestProject({
      version: '1.2.3',
      android: { versionName: '1.2.3', versionCode: 10203 },
    });

    const result = syncVersions(project.root);

    expect(result.platforms.map((p) => [p.platform, p.updated])).toEqual([
      ['android', false],
      ['ios', true],
    ]);
  });

  it('lists a platform whose file is missing', () => {
    project = new TestProject({ version: '1.2.3', ios: false });

    const result = syncVersions(project.root);

    expect(result.platforms.map((p) => p.platform)).toEqual(['android']);
    expect(result.missing).toEqual(['ios']);
    expect(project.readGradle()).toContain('versionName "1.2.3"');
  });

  it('throws when no native project files are found', () => {
    project = new TestProject({ version: '1.2.3', android: false, ios: false });

    expect(() => syncVersions(project.root)).toThrow(
      'No native project files found',
    );
  });

  it('throws when both platforms are skipped', () => {
    project = new TestProject({ version: '1.2.3' });

    expect(() =>
      syncVersions(project.root, { skipAndroid: true, skipIos: true }),
    ).toThrow('Nothing to sync');
  });
});

describe('checkVersions', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('reports platforms out of sync without writing', () => {
    project = new TestProject({ version: '1.2.3' });

    const status = checkVersions(project.root);

    expect(status).toMatchObject({
      packageName: 'test-app',
      packageVersion: '1.2.3',
      target: { versionName: '1.2.3', versionCode: 10203 },
      overridden: false,
      platforms: [
        { platform: 'android', versionCode: '1', inSync: false },
        { platform: 'ios', versionCode: '1', inSync: false },
      ],
      missing: [],
    });
    expect(project.readGradle()).toContain('versionCode 1');
  });

  it('reports platforms in sync', () => {
    project = new TestProject({
      version: '1.2.3',
      android: { versionName: '1.2.3', versionCode: 10203 },
      ios: [
        {
          name: 'Release',
          version: '1.2.3',
          buildNumber: '10203',
          bundleId: 'com.testapp',
        },
      ],
    });

    const status = checkVersions(project.root);

    expect(status.platforms.map((p) => p.inSync)).toEqual([true, true]);
  });

  it('compares against the overridden target', () => {
    project = new TestProject({
      version: '1.0.0',
      android: { versionName: '2.0.0', versionCode: 2000000 },
      ios: false,
    });

    expect(
      checkVersions(project.root, { versionName: '2.0.0', reserveBuilds: 100 }),
    ).toMatchObject({
      target: { versionName: '2.0.0', versionCode: 2000000 },
      overridden: true,
      platforms: [{ inSync: true }],
    });
  });

  it('does not treat reserveBuilds alone as an override', () => {
    project = new TestProject({ version: '1.2.3', ios: false });

    expect(checkVersions(project.root, { reserveBuilds: 100 })).toMatchObject({
      target: { versionName: '1.2.3', versionCode: 1020300 },
      overridden: false,
    });
  });

  it('reads the iOS values of the requested configuration', () => {
    project = new TestProject({
      version: '1.2.3',
      android: false,
      ios: [
        {
          name: 'Debug',
          version: '1.2.3',
          buildNumber: '10203',
          bundleId: 'com.testapp',
        },
        {
          name: 'Release',
          version: '1.0.0',
          buildNumber: '1',
          bundleId: 'com.testapp',
        },
      ],
    });

    expect(checkVersions(project.root).platforms[0].inSync).toBe(false);
    expect(
      checkVersions(project.root, { configuration: 'Debug' }).platforms[0]
        .inSync,
    ).toBe(true);
  });

  it('throws when no native project files are found', () => {
    project = new TestProject({ version: '1.2.3', android: false, ios: false });

    expect(() => checkVersions(project.root)).toThrow(
      'No native project files found',
    );
  });
});

describe('resolveVersions', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('resolves from package.json by default', () => {
    project = new TestProject({ version: '1.2.3', android: false, ios: false });

    const result = resolveVersions(project.root);
    expect(result).toEqual({ versionName: '1.2.3', versionCode: 10203 });
  });

  it('uses versionName override', () => {
    project = new TestProject({ version: '1.0.0', android: false, ios: false });

    const result = resolveVersions(project.root, { versionName: '4.5.6' });
    expect(result).toEqual({ versionName: '4.5.6', versionCode: 40506 });
  });

  it('uses both versionName and versionCode overrides', () => {
    project = new TestProject({ version: '1.0.0', android: false, ios: false });

    const result = resolveVersions(project.root, {
      versionName: 'anything',
      versionCode: 77,
    });
    expect(result).toEqual({ versionName: 'anything', versionCode: 77 });
  });

  it('does not modify any files', () => {
    project = new TestProject({ version: '9.9.9' });

    resolveVersions(project.root);

    const gradle = project.readGradle();
    expect(gradle).toContain('versionCode 1');
    expect(gradle).toContain('versionName "1.0.0"');

    const pbxproj = project.readPbxproj();
    expect(pbxproj).toContain('MARKETING_VERSION = 1.0.0;');
  });

  it('applies reserveBuilds to calculated version code', () => {
    project = new TestProject({ version: '1.2.3', android: false, ios: false });

    const result = resolveVersions(project.root, { reserveBuilds: 100 });
    expect(result).toEqual({ versionName: '1.2.3', versionCode: 1020300 });
  });

  it('ignores reserveBuilds when versionCode is manually set', () => {
    project = new TestProject({ version: '1.0.0', android: false, ios: false });

    const result = resolveVersions(project.root, {
      versionCode: 42,
      reserveBuilds: 100,
    });
    expect(result).toEqual({ versionName: '1.0.0', versionCode: 42 });
  });

  it('throws when reserved version code exceeds max', () => {
    project = new TestProject({
      version: '200.0.0',
      android: false,
      ios: false,
    });

    expect(() =>
      resolveVersions(project.root, { reserveBuilds: 10000 }),
    ).toThrow('exceeds maximum value');
  });

  it('throws when reserveBuilds is not a positive integer', () => {
    project = new TestProject({ version: '1.0.0', android: false, ios: false });

    expect(() => resolveVersions(project.root, { reserveBuilds: 0 })).toThrow(
      'reserve-builds must be a positive integer',
    );
    expect(() => resolveVersions(project.root, { reserveBuilds: -1 })).toThrow(
      'reserve-builds must be a positive integer',
    );
    expect(() => resolveVersions(project.root, { reserveBuilds: 1.5 })).toThrow(
      'reserve-builds must be a positive integer',
    );
  });

  it('throws when versionCode is not a positive integer', () => {
    project = new TestProject({ version: '1.0.0', android: false, ios: false });

    expect(() => resolveVersions(project.root, { versionCode: 0 })).toThrow(
      'version-code must be a positive integer',
    );
    expect(() => resolveVersions(project.root, { versionCode: -5 })).toThrow(
      'version-code must be a positive integer',
    );
    expect(() => resolveVersions(project.root, { versionCode: 1.5 })).toThrow(
      'version-code must be a positive integer',
    );
  });
});

describe('readNativeValues', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('reads app id and versions for android', () => {
    project = new TestProject({
      android: {
        applicationId: 'com.testapp',
        versionName: '1.2.3',
        versionCode: 10203,
      },
      ios: false,
    });

    expect(readNativeValues(project.root, 'android')).toEqual({
      appId: 'com.testapp',
      versionName: '1.2.3',
      versionCode: '10203',
    });
  });

  it('reads app id and versions for ios from the requested configuration', () => {
    project = new TestProject({
      android: false,
      ios: [
        {
          name: 'Debug',
          bundleId: 'com.testapp.debug',
          version: '1.2.4',
          buildNumber: '10204',
        },
        {
          name: 'Release',
          bundleId: 'com.testapp',
          version: '1.2.3',
          buildNumber: '10203',
        },
      ],
    });

    expect(readNativeValues(project.root, 'ios')).toEqual({
      appId: 'com.testapp',
      versionName: '1.2.3',
      versionCode: '10203',
    });

    expect(
      readNativeValues(project.root, 'ios', { configuration: 'Debug' }),
    ).toEqual({
      appId: 'com.testapp.debug',
      versionName: '1.2.4',
      versionCode: '10204',
    });
  });

  it('throws when any value cannot be resolved', () => {
    project = new TestProject({ android: false, ios: [{ name: 'Release' }] });

    expect(() => readNativeValues(project.root, 'ios')).toThrow(
      'No PRODUCT_BUNDLE_IDENTIFIER',
    );
  });

  it('uses explicit file paths', () => {
    project = new TestProject({
      ios: [{ name: 'Release', bundleId: 'com.testapp' }],
    });

    const android = readNativeValues(project.root, 'android', {
      gradlePath: project.gradlePath(),
    });
    const ios = readNativeValues(project.root, 'ios', {
      pbxprojPath: project.pbxprojPath(),
    });
    expect(android.appId).toBe('com.testapp');
    expect(ios.appId).toBe('com.testapp');
  });
});

describe('formatEnv', () => {
  it('renders APP_ID, VERSION_NAME and VERSION_CODE in that order', () => {
    const env = formatEnv({
      appId: 'com.test-app',
      versionName: '1.2.3-beta.1+build.5',
      versionCode: '10203',
    });

    expect(env).toBe(
      'APP_ID=com.test-app\nVERSION_NAME=1.2.3-beta.1+build.5\nVERSION_CODE=10203\n',
    );
  });

  it('rejects values outside the shell-safe character set', () => {
    const values = {
      appId: 'com.testapp',
      versionName: '1.2.3',
      versionCode: '1',
    };

    expect(() => formatEnv({ ...values, versionName: '1.2.3 beta' })).toThrow(
      'VERSION_NAME value "1.2.3 beta" contains characters outside',
    );
    expect(() => formatEnv({ ...values, appId: '$(id)' })).toThrow(
      'APP_ID value "$(id)"',
    );
    expect(() => formatEnv({ ...values, versionCode: '' })).toThrow(
      'VERSION_CODE value ""',
    );
  });
});

describe('formatTemplate', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('fills the placeholders with the values of the platform', () => {
    project = new TestProject({
      android: {
        applicationId: 'com.testapp',
        versionName: '1.2.3',
        versionCode: 10203,
      },
      ios: [
        {
          name: 'Debug',
          bundleId: 'com.testapp.debug',
          version: '4.5.6',
          buildNumber: '40506',
        },
        {
          name: 'Release',
          bundleId: 'com.testapp',
          version: '4.5.6',
          buildNumber: '40506',
        },
      ],
    });

    const template = '{appId}@{versionName}+{versionCode}';
    expect(formatTemplate(template, project.root, 'android')).toBe(
      'com.testapp@1.2.3+10203',
    );
    expect(formatTemplate(template, project.root, 'ios')).toBe(
      'com.testapp@4.5.6+40506',
    );

    const debug = formatTemplate('{appId}', project.root, 'ios', {
      configuration: 'Debug',
    });
    expect(debug).toBe('com.testapp.debug');
  });

  it('reads only the referenced values', () => {
    project = new TestProject({ android: false, ios: [{ name: 'Release' }] });

    const template = '{versionName}+{versionCode}';
    expect(formatTemplate(template, project.root, 'ios')).toBe('1.0.0+1');
    expect(() => formatTemplate('{appId}', project.root, 'ios')).toThrow(
      'No PRODUCT_BUNDLE_IDENTIFIER',
    );
  });

  it('rejects unknown placeholders and keeps other braces', () => {
    project = new TestProject({ android: false, ios: false });

    expect(() => formatTemplate('{foo}', project.root, 'ios')).toThrow(
      'Unknown placeholder {foo} in template (available: {appId}, {versionName}, {versionCode})',
    );
    expect(formatTemplate('{} { } literal', project.root, 'ios')).toBe(
      '{} { } literal',
    );
  });
});
