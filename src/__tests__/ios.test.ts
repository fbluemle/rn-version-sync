import * as fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { getIOSAppId, getIOSVersions, updateIOSVersion } from '../ios';
import { TestProject, UNIT_TEST_PRODUCT_TYPE } from './helpers';

describe('updateIOSVersion', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('updates MARKETING_VERSION and CURRENT_PROJECT_VERSION in a single config', () => {
    project = new TestProject({
      android: false,
      ios: [{ name: 'Release' }],
    });

    const result = updateIOSVersion(project.root, '2.3.4', '20304');

    expect(result).toBe(project.pbxprojPath());
    const content = project.readPbxproj();
    expect(content).toContain('MARKETING_VERSION = 2.3.4;');
    expect(content).toContain('CURRENT_PROJECT_VERSION = 20304;');
  });

  it('updates ALL build configurations (Debug + Release)', () => {
    project = new TestProject({ android: false });

    updateIOSVersion(project.root, '2.3.4', '20304');

    const content = project.readPbxproj();

    const marketingMatches = content.match(/MARKETING_VERSION = ([^;]+);/g);
    expect(marketingMatches).toHaveLength(2);
    expect(marketingMatches?.every((m) => m.includes('2.3.4'))).toBe(true);

    const buildMatches = content.match(/CURRENT_PROJECT_VERSION = ([^;]+);/g);
    expect(buildMatches).toHaveLength(2);
    expect(buildMatches?.every((m) => m.includes('20304'))).toBe(true);
  });

  it('updates all three configs (Debug + Release + Staging)', () => {
    project = new TestProject({
      android: false,
      ios: [{ name: 'Debug' }, { name: 'Release' }, { name: 'Staging' }],
    });

    updateIOSVersion(project.root, '3.0.0', '30000');

    const content = project.readPbxproj();

    const marketingMatches = content.match(/MARKETING_VERSION = ([^;]+);/g);
    expect(marketingMatches).toHaveLength(3);
    expect(marketingMatches?.every((m) => m.includes('3.0.0'))).toBe(true);

    const buildMatches = content.match(/CURRENT_PROJECT_VERSION = ([^;]+);/g);
    expect(buildMatches).toHaveLength(3);
    expect(buildMatches?.every((m) => m.includes('30000'))).toBe(true);
  });

  it('returns null when ios directory is missing', () => {
    project = new TestProject({ android: false, ios: false });

    expect(updateIOSVersion(project.root, '1.0.0', '10000')).toBeNull();
  });

  it('throws when the file has no version settings', () => {
    project = new TestProject({
      android: false,
      ios: [{ name: 'Release', version: null, buildNumber: null }],
    });

    expect(() => updateIOSVersion(project.root, '1.0.0', '10000')).toThrow(
      'No MARKETING_VERSION found',
    );
  });

  it('does not write file when nothing changed', () => {
    project = new TestProject({
      android: false,
      ios: [{ name: 'Release', version: '2.3.4', buildNumber: '20304' }],
    });

    const before = fs.statSync(project.pbxprojPath()).mtimeMs;
    updateIOSVersion(project.root, '2.3.4', '20304');
    const after = fs.statSync(project.pbxprojPath()).mtimeMs;
    expect(after).toBe(before);
  });

  it('uses explicit pbxprojPath when provided', () => {
    project = new TestProject({ android: false });

    updateIOSVersion(project.root, '5.0.0', '50000', project.pbxprojPath());

    const content = project.readPbxproj();
    expect(content).toContain('MARKETING_VERSION = 5.0.0;');
  });

  it('throws when explicit pbxprojPath does not exist', () => {
    project = new TestProject({ android: false, ios: false });

    expect(() =>
      updateIOSVersion(
        project.root,
        '1.0.0',
        '10000',
        '/nonexistent/project.pbxproj',
      ),
    ).toThrow('project.pbxproj not found at specified path');
  });
});

describe('getIOSVersions', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('reads MARKETING_VERSION and CURRENT_PROJECT_VERSION from pbxproj', () => {
    project = new TestProject({
      android: false,
      ios: [{ name: 'Release', version: '1.2.3', buildNumber: '1020300' }],
    });

    expect(getIOSVersions(project.root)).toEqual({
      versionName: '1.2.3',
      versionCode: '1020300',
    });
  });

  it('preserves the version code as written (does not recompute)', () => {
    project = new TestProject({
      android: false,
      ios: [{ name: 'Release', version: '1.2.3', buildNumber: '42' }],
    });

    expect(getIOSVersions(project.root).versionCode).toBe('42');
  });

  it('reads the requested configuration', () => {
    project = new TestProject({
      android: false,
      ios: [
        { name: 'Debug', version: '1.0.0', buildNumber: '1' },
        { name: 'Release', version: '2.0.0', buildNumber: '20000' },
      ],
    });

    expect(getIOSVersions(project.root)).toEqual({
      versionName: '2.0.0',
      versionCode: '20000',
    });
    expect(getIOSVersions(project.root, undefined, 'Debug')).toEqual({
      versionName: '1.0.0',
      versionCode: '1',
    });
  });

  it('ignores other targets listed before the application target', () => {
    project = new TestProject({
      android: false,
      iosTargets: [
        {
          name: 'TestAppTests',
          productType: UNIT_TEST_PRODUCT_TYPE,
          configs: [{ name: 'Release', version: '9.9.9', buildNumber: '99' }],
        },
        {
          name: 'TestApp',
          configs: [
            { name: 'Release', version: '1.2.3', buildNumber: '10203' },
          ],
        },
      ],
    });

    expect(getIOSVersions(project.root)).toEqual({
      versionName: '1.2.3',
      versionCode: '10203',
    });
  });

  it('falls back to the project-level configuration', () => {
    project = new TestProject({
      android: false,
      ios: [{ name: 'Release', version: null, buildNumber: null }],
      iosProjectConfigs: [
        { name: 'Release', version: '3.0.0', buildNumber: '30000' },
      ],
    });

    expect(getIOSVersions(project.root)).toEqual({
      versionName: '3.0.0',
      versionCode: '30000',
    });
  });

  it('prefers the target configuration over the project configuration', () => {
    project = new TestProject({
      android: false,
      ios: [{ name: 'Release', version: '1.0.0', buildNumber: null }],
      iosProjectConfigs: [
        { name: 'Release', version: '3.0.0', buildNumber: '30000' },
      ],
    });

    expect(getIOSVersions(project.root)).toEqual({
      versionName: '1.0.0',
      versionCode: '30000',
    });
  });

  it('throws when the configuration does not exist', () => {
    project = new TestProject({ android: false });

    expect(() => getIOSVersions(project.root, undefined, 'Staging')).toThrow(
      'Build configuration "Staging" not found for target "TestApp"',
    );
  });

  it('throws when a version setting is missing', () => {
    project = new TestProject({
      android: false,
      ios: [{ name: 'Release', version: '1.0.0', buildNumber: null }],
    });

    expect(() => getIOSVersions(project.root)).toThrow(
      'No CURRENT_PROJECT_VERSION in build configuration "Release" of target "TestApp"',
    );
  });

  it('throws when a version setting references a build setting variable', () => {
    project = new TestProject({
      android: false,
      ios: [{ name: 'Release', version: '"$(APP_VERSION)"' }],
    });

    expect(() => getIOSVersions(project.root)).toThrow(
      'references a build setting variable',
    );
  });

  it('throws when project.pbxproj is missing', () => {
    project = new TestProject({ android: false, ios: false });
    expect(() => getIOSVersions(project.root)).toThrow(
      'Could not find iOS project.pbxproj',
    );
  });
});

describe('getIOSAppId', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('reads PRODUCT_BUNDLE_IDENTIFIER from the Release configuration by default', () => {
    project = new TestProject({
      android: false,
      ios: [
        { name: 'Debug', bundleId: 'com.testapp.debug' },
        { name: 'Release', bundleId: 'com.testapp' },
      ],
    });

    expect(getIOSAppId(project.root)).toBe('com.testapp');
  });

  it('reads the requested configuration', () => {
    project = new TestProject({
      android: false,
      ios: [
        { name: 'Debug', bundleId: 'com.testapp.debug' },
        { name: 'Release', bundleId: 'com.testapp' },
        { name: 'Staging', bundleId: 'com.testapp.staging' },
      ],
    });

    expect(getIOSAppId(project.root, undefined, 'Debug')).toBe(
      'com.testapp.debug',
    );
    expect(getIOSAppId(project.root, undefined, 'Staging')).toBe(
      'com.testapp.staging',
    );
  });

  it('strips quotes from the identifier', () => {
    project = new TestProject({
      android: false,
      ios: [{ name: 'Release', bundleId: '"com.test-app"' }],
    });

    expect(getIOSAppId(project.root)).toBe('com.test-app');
  });

  it('ignores other targets listed before the application target', () => {
    project = new TestProject({
      android: false,
      iosTargets: [
        {
          name: 'TestAppTests',
          productType: UNIT_TEST_PRODUCT_TYPE,
          configs: [
            { name: 'Debug', bundleId: 'com.testapp.tests' },
            { name: 'Release', bundleId: 'com.testapp.tests' },
          ],
        },
        {
          name: 'TestApp',
          configs: [
            { name: 'Debug', bundleId: 'com.testapp.debug' },
            { name: 'Release', bundleId: 'com.testapp' },
          ],
        },
      ],
    });

    expect(getIOSAppId(project.root)).toBe('com.testapp');
  });

  it('throws when the identifier references a build setting variable', () => {
    project = new TestProject({
      android: false,
      ios: [
        {
          name: 'Release',
          bundleId:
            '"org.reactjs.native.example.$(PRODUCT_NAME:rfc1034identifier)"',
        },
      ],
    });

    expect(() => getIOSAppId(project.root)).toThrow(
      'references a build setting variable',
    );
  });

  it('throws when the configuration does not exist', () => {
    project = new TestProject({
      android: false,
      ios: [
        { name: 'Debug', bundleId: 'com.testapp' },
        { name: 'Release', bundleId: 'com.testapp' },
      ],
    });

    expect(() => getIOSAppId(project.root, undefined, 'Staging')).toThrow(
      'Build configuration "Staging" not found for target "TestApp"',
    );
    expect(() => getIOSAppId(project.root, undefined, 'Staging')).toThrow(
      '(available: "Debug", "Release")',
    );
  });

  it('falls back to the project-level configuration', () => {
    project = new TestProject({
      android: false,
      ios: [{ name: 'Release' }],
      iosProjectConfigs: [{ name: 'Release', bundleId: 'com.testapp' }],
    });

    expect(getIOSAppId(project.root)).toBe('com.testapp');
  });

  it('throws when the configuration has no PRODUCT_BUNDLE_IDENTIFIER', () => {
    project = new TestProject({ android: false, ios: [{ name: 'Release' }] });

    expect(() => getIOSAppId(project.root)).toThrow(
      'No PRODUCT_BUNDLE_IDENTIFIER in build configuration "Release" of target "TestApp"',
    );
  });

  it('throws when there are several application targets', () => {
    project = new TestProject({
      android: false,
      iosTargets: [
        {
          name: 'TestApp',
          configs: [{ name: 'Release', bundleId: 'com.testapp' }],
        },
        {
          name: 'OtherApp',
          configs: [{ name: 'Release', bundleId: 'com.otherapp' }],
        },
      ],
    });

    expect(() => getIOSAppId(project.root)).toThrow(
      'Multiple application targets found',
    );
    expect(() => getIOSAppId(project.root)).toThrow('"TestApp", "OtherApp"');
  });

  it('throws when there is no application target', () => {
    project = new TestProject({
      android: false,
      iosTargets: [
        {
          name: 'TestAppTests',
          productType: UNIT_TEST_PRODUCT_TYPE,
          configs: [{ name: 'Release', bundleId: 'com.testapp.tests' }],
        },
      ],
    });

    expect(() => getIOSAppId(project.root)).toThrow(
      'No application target found',
    );
  });

  it('uses explicit pbxprojPath when provided', () => {
    project = new TestProject({
      android: false,
      ios: [{ name: 'Release', bundleId: 'com.testapp' }],
    });

    expect(getIOSAppId(project.root, project.pbxprojPath())).toBe(
      'com.testapp',
    );
  });

  it('throws when project.pbxproj is missing', () => {
    project = new TestProject({ android: false, ios: false });
    expect(() => getIOSAppId(project.root)).toThrow(
      'Could not find iOS project.pbxproj',
    );
  });
});
