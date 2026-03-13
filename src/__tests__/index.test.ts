import {describe, it, expect, afterEach} from 'vitest';
import {syncVersions, resolveVersions} from '../index';
import {TestProject} from './helpers';

describe('syncVersions', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('syncs both Android and iOS', () => {
    project = new TestProject({version: '1.2.3'});

    syncVersions(project.root);

    const gradle = project.readGradle();
    expect(gradle).toContain('versionName "1.2.3"');
    expect(gradle).toContain('versionCode 10203');

    const pbxproj = project.readPbxproj();
    expect(pbxproj).toContain('MARKETING_VERSION = 1.2.3;');
    expect(pbxproj).toContain('CURRENT_PROJECT_VERSION = 10203;');
  });

  it('uses manual versionCode override', () => {
    project = new TestProject({version: '1.2.3', ios: false});

    syncVersions(project.root, {versionCode: 999});

    const gradle = project.readGradle();
    expect(gradle).toContain('versionCode 999');
  });

  it('throws on versionCode exceeding 32-bit int max', () => {
    project = new TestProject({version: '1.0.0', android: false, ios: false});

    expect(() => syncVersions(project.root, {versionCode: 2147483648})).toThrow(
      'exceeds maximum value'
    );
  });

  it('is deterministic across repeated runs', () => {
    project = new TestProject({version: '1.2.3', ios: false});

    syncVersions(project.root);
    const first = project.readGradle();

    syncVersions(project.root);
    const second = project.readGradle();

    expect(second).toBe(first);
  });

  it('uses versionName override instead of package.json', () => {
    project = new TestProject({version: '1.0.0'});

    syncVersions(project.root, {versionName: '9.8.7'});

    const gradle = project.readGradle();
    expect(gradle).toContain('versionName "9.8.7"');
    expect(gradle).toContain('versionCode 90807');

    const pbxproj = project.readPbxproj();
    expect(pbxproj).toContain('MARKETING_VERSION = 9.8.7;');
  });

  it('allows non-semver versionName when versionCode is also provided', () => {
    project = new TestProject({version: '1.0.0', ios: false});

    syncVersions(project.root, {versionName: 'custom-build', versionCode: 42});

    const gradle = project.readGradle();
    expect(gradle).toContain('versionName "custom-build"');
    expect(gradle).toContain('versionCode 42');
  });

  it('skips Android when skipAndroid is set', () => {
    project = new TestProject({version: '2.0.0'});

    syncVersions(project.root, {skipAndroid: true});

    // Android should be untouched
    const gradle = project.readGradle();
    expect(gradle).toContain('versionName "1.0.0"');
    expect(gradle).toContain('versionCode 1');

    // iOS should be updated
    const pbxproj = project.readPbxproj();
    expect(pbxproj).toContain('MARKETING_VERSION = 2.0.0;');
  });

  it('skips iOS when skipIos is set', () => {
    project = new TestProject({version: '2.0.0'});

    syncVersions(project.root, {skipIos: true});

    // Android should be updated
    const gradle = project.readGradle();
    expect(gradle).toContain('versionName "2.0.0"');

    // iOS should be untouched
    const pbxproj = project.readPbxproj();
    expect(pbxproj).toContain('MARKETING_VERSION = 1.0.0;');
  });

  it('uses explicit gradlePath', () => {
    project = new TestProject({version: '3.0.0'});

    syncVersions(project.root, {
      gradlePath: project.gradlePath(),
      skipIos: true,
    });

    const gradle = project.readGradle();
    expect(gradle).toContain('versionName "3.0.0"');
  });

  it('uses explicit pbxprojPath', () => {
    project = new TestProject({version: '3.0.0'});

    syncVersions(project.root, {
      pbxprojPath: project.pbxprojPath(),
      skipAndroid: true,
    });

    const pbxproj = project.readPbxproj();
    expect(pbxproj).toContain('MARKETING_VERSION = 3.0.0;');
  });
});

describe('resolveVersions', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('resolves from package.json by default', () => {
    project = new TestProject({version: '1.2.3', android: false, ios: false});

    const result = resolveVersions(project.root);
    expect(result).toEqual({versionName: '1.2.3', versionCode: 10203});
  });

  it('uses versionName override', () => {
    project = new TestProject({version: '1.0.0', android: false, ios: false});

    const result = resolveVersions(project.root, {versionName: '4.5.6'});
    expect(result).toEqual({versionName: '4.5.6', versionCode: 40506});
  });

  it('uses both versionName and versionCode overrides', () => {
    project = new TestProject({version: '1.0.0', android: false, ios: false});

    const result = resolveVersions(project.root, {versionName: 'anything', versionCode: 77});
    expect(result).toEqual({versionName: 'anything', versionCode: 77});
  });

  it('does not modify any files', () => {
    project = new TestProject({version: '9.9.9'});

    resolveVersions(project.root);

    const gradle = project.readGradle();
    expect(gradle).toContain('versionCode 1');
    expect(gradle).toContain('versionName "1.0.0"');

    const pbxproj = project.readPbxproj();
    expect(pbxproj).toContain('MARKETING_VERSION = 1.0.0;');
  });

  it('applies reserveBuilds to calculated version code', () => {
    project = new TestProject({version: '1.2.3', android: false, ios: false});

    const result = resolveVersions(project.root, {reserveBuilds: 100});
    expect(result).toEqual({versionName: '1.2.3', versionCode: 1020300});
  });

  it('ignores reserveBuilds when versionCode is manually set', () => {
    project = new TestProject({version: '1.0.0', android: false, ios: false});

    const result = resolveVersions(project.root, {versionCode: 42, reserveBuilds: 100});
    expect(result).toEqual({versionName: '1.0.0', versionCode: 42});
  });

  it('throws when reserved version code exceeds max', () => {
    project = new TestProject({version: '200.0.0', android: false, ios: false});

    expect(() => resolveVersions(project.root, {reserveBuilds: 10000})).toThrow(
      'exceeds maximum value'
    );
  });

  it('throws when reserveBuilds is not a positive integer', () => {
    project = new TestProject({version: '1.0.0', android: false, ios: false});

    expect(() => resolveVersions(project.root, {reserveBuilds: 0})).toThrow(
      'reserve-builds must be a positive integer'
    );
    expect(() => resolveVersions(project.root, {reserveBuilds: -1})).toThrow(
      'reserve-builds must be a positive integer'
    );
    expect(() => resolveVersions(project.root, {reserveBuilds: 1.5})).toThrow(
      'reserve-builds must be a positive integer'
    );
  });
});
