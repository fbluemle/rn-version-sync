import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'fs';
import {updateIOSVersion} from '../ios';
import {TestProject} from './helpers';

describe('updateIOSVersion', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('updates MARKETING_VERSION and CURRENT_PROJECT_VERSION in a single config', () => {
    project = new TestProject({
      android: false,
      ios: [{name: 'Release'}],
    });

    updateIOSVersion(project.root, '2.3.4', '20304', false);

    const content = project.readPbxproj();
    expect(content).toContain('MARKETING_VERSION = 2.3.4;');
    expect(content).toContain('CURRENT_PROJECT_VERSION = 20304;');
  });

  it('updates ALL build configurations (Debug + Release)', () => {
    project = new TestProject({android: false});

    updateIOSVersion(project.root, '2.3.4', '20304', false);

    const content = project.readPbxproj();

    const marketingMatches = content.match(/MARKETING_VERSION = ([^;]+);/g);
    expect(marketingMatches).toHaveLength(2);
    expect(marketingMatches!.every((m) => m.includes('2.3.4'))).toBe(true);

    const buildMatches = content.match(/CURRENT_PROJECT_VERSION = ([^;]+);/g);
    expect(buildMatches).toHaveLength(2);
    expect(buildMatches!.every((m) => m.includes('20304'))).toBe(true);
  });

  it('updates all three configs (Debug + Release + Staging)', () => {
    project = new TestProject({
      android: false,
      ios: [{name: 'Debug'}, {name: 'Release'}, {name: 'Staging'}],
    });

    updateIOSVersion(project.root, '3.0.0', '30000', false);

    const content = project.readPbxproj();

    const marketingMatches = content.match(/MARKETING_VERSION = ([^;]+);/g);
    expect(marketingMatches).toHaveLength(3);
    expect(marketingMatches!.every((m) => m.includes('3.0.0'))).toBe(true);

    const buildMatches = content.match(/CURRENT_PROJECT_VERSION = ([^;]+);/g);
    expect(buildMatches).toHaveLength(3);
    expect(buildMatches!.every((m) => m.includes('30000'))).toBe(true);
  });

  it('skips silently when ios directory is missing', () => {
    project = new TestProject({android: false, ios: false});
    // Should not throw
    updateIOSVersion(project.root, '1.0.0', '10000', false);
  });

  it('does not write file when nothing changed', () => {
    project = new TestProject({
      android: false,
      ios: [{name: 'Release', version: '2.3.4', buildNumber: '20304'}],
    });

    const before = fs.statSync(project.pbxprojPath()).mtimeMs;
    updateIOSVersion(project.root, '2.3.4', '20304', false);
    const after = fs.statSync(project.pbxprojPath()).mtimeMs;
    expect(after).toBe(before);
  });

  it('uses explicit pbxprojPath when provided', () => {
    project = new TestProject({android: false});

    updateIOSVersion(project.root, '5.0.0', '50000', false, project.pbxprojPath());

    const content = project.readPbxproj();
    expect(content).toContain('MARKETING_VERSION = 5.0.0;');
  });

  it('throws when explicit pbxprojPath does not exist', () => {
    project = new TestProject({android: false, ios: false});

    expect(() =>
      updateIOSVersion(project.root, '1.0.0', '10000', false, '/nonexistent/project.pbxproj')
    ).toThrow('project.pbxproj not found at specified path');
  });
});
