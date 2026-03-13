import {describe, it, expect, afterEach} from 'vitest';
import {syncVersions} from '../index';
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
});
