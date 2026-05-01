import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'fs';
import {updateAndroidVersion, getAndroidVersions} from '../android';
import {TestProject} from './helpers';

describe('updateAndroidVersion', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('updates versionName and versionCode', () => {
    project = new TestProject({ios: false});

    updateAndroidVersion(project.root, '2.3.4', 20304, false);

    const content = project.readGradle();
    expect(content).toContain('versionName "2.3.4"');
    expect(content).toContain('versionCode 20304');
  });

  it('does not write file when nothing changed', () => {
    project = new TestProject({
      android: {versionName: '1.2.3', versionCode: 10203},
      ios: false,
    });

    const before = fs.statSync(project.gradlePath()).mtimeMs;
    updateAndroidVersion(project.root, '1.2.3', 10203, false);
    const after = fs.statSync(project.gradlePath()).mtimeMs;
    expect(after).toBe(before);
  });

  it('skips silently when build.gradle is missing', () => {
    project = new TestProject({android: false, ios: false});
    // Should not throw
    updateAndroidVersion(project.root, '1.0.0', 10000, false);
  });

  it('handles single-quoted versionName', () => {
    project = new TestProject({
      android: {versionName: '1.0.0', versionCode: 1, quote: "'"},
      ios: false,
    });

    updateAndroidVersion(project.root, '2.0.0', 20000, false);

    const content = project.readGradle();
    expect(content).toContain("versionName '2.0.0'");
  });

  it('uses explicit gradlePath when provided', () => {
    project = new TestProject({ios: false});

    updateAndroidVersion(project.root, '5.0.0', 50000, false, project.gradlePath());

    const content = project.readGradle();
    expect(content).toContain('versionName "5.0.0"');
  });

  it('throws when explicit gradlePath does not exist', () => {
    project = new TestProject({android: false, ios: false});

    expect(() =>
      updateAndroidVersion(project.root, '1.0.0', 10000, false, '/nonexistent/build.gradle')
    ).toThrow('build.gradle not found at specified path');
  });
});

describe('getAndroidVersions', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('reads versionName and versionCode from build.gradle', () => {
    project = new TestProject({
      android: {versionName: '1.2.3', versionCode: 1020300},
      ios: false,
    });

    expect(getAndroidVersions(project.root)).toEqual({
      versionName: '1.2.3',
      versionCode: '1020300',
    });
  });

  it('preserves the version code as written (does not recompute)', () => {
    project = new TestProject({
      android: {versionName: '1.2.3', versionCode: 42},
      ios: false,
    });

    expect(getAndroidVersions(project.root).versionCode).toBe('42');
  });

  it('throws when build.gradle is missing', () => {
    project = new TestProject({android: false, ios: false});
    expect(() => getAndroidVersions(project.root)).toThrow(
      'Could not find Android build.gradle'
    );
  });
});
