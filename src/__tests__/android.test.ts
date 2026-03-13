import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'fs';
import {updateAndroidVersion} from '../android';
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
});
