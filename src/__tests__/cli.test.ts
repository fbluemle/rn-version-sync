import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestProject, buildGradle, buildPbxproj } from './helpers';

const root = path.resolve(__dirname, '..', '..');
const CLI = path.join(root, 'dist', 'cli.js');
const packageVersion: string = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
).version;

/** Run the built CLI in cwd and capture exit status, stdout and stderr */
function run(cwd: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('cli', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  const HEADER = 'PLATFORM  APP ID       VERSION        STATUS';
  const JS_ROW = 'js        test-app     1.2.3';

  describe('check', () => {
    it('reports outdated platforms and exits 1', () => {
      project = new TestProject({ version: '1.2.3' });

      expect(run(project.root)).toEqual({
        status: 1,
        stdout: [
          'PLATFORM  APP ID       VERSION    STATUS',
          JS_ROW,
          'android   com.testapp  1.0.0 (1)  outdated',
          'ios       com.testapp  1.0.0 (1)  outdated',
          '',
        ].join('\n'),
        stderr: 'Run with --write to update the native files.\n',
      });
      expect(project.readGradle()).toContain('versionCode 1');
    });

    it('reports platforms in sync and exits 0', () => {
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

      const result = run(project.root);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(
        'android   com.testapp  1.2.3 (10203)  ok\n',
      );
      expect(result.stdout).toContain(
        'ios       com.testapp  1.2.3 (10203)  ok\n',
      );
    });

    it('lists a missing platform as not found and exits 0', () => {
      project = new TestProject({
        version: '1.2.3',
        android: { versionName: '1.2.3', versionCode: 10203 },
        ios: false,
      });

      const result = run(project.root);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(
        `ios${' '.repeat(35)}not found, pass --skip-ios to ignore\n`,
      );
    });

    it('omits a skipped platform', () => {
      project = new TestProject({
        version: '1.2.3',
        android: { versionName: '1.2.3', versionCode: 10203 },
        ios: false,
      });

      expect(run(project.root, '--skip-ios').stdout).not.toContain('ios');
    });

    it('fails when no native project files are found', () => {
      project = new TestProject({ android: false, ios: false });

      const result = run(project.root);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Error: No native project files found');
    });

    it('fails when both platforms are skipped', () => {
      project = new TestProject();

      expect(run(project.root, '--skip-android', '--skip-ios')).toEqual({
        status: 1,
        stdout: '',
        stderr: 'Error: Nothing to sync: both platforms are skipped\n',
      });
    });

    it('applies --reserve-builds without marking the js row', () => {
      project = new TestProject({ version: '1.2.3', ios: false });

      const result = run(project.root, '--write', '--reserve-builds', '100');
      expect(result.stdout).toContain(`${JS_ROW}\n`);
      expect(result.stdout).toContain(
        'android   com.testapp  1.2.3 (1020300)  updated\n',
      );
      expect(result.stdout).not.toContain('overridden');
    });

    it('shows an overridden target in the js row', () => {
      project = new TestProject({ version: '1.2.3' });

      const result = run(
        project.root,
        '--version-name',
        '2.0.0',
        '--version-code',
        '7',
      );
      expect(result.stdout).toContain(
        'js        test-app     1.2.3      overridden 2.0.0 (7)\n',
      );
    });

    it('labels the iOS row with --configuration', () => {
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

      expect(run(project.root, '--configuration', 'Debug').stdout).toContain(
        'ios (Debug)  com.testapp  1.2.3 (10203)  ok\n',
      );
    });

    it('uses --project-dir instead of the working directory', () => {
      project = new TestProject({ version: '1.2.3' });
      const other = new TestProject({ version: '9.9.9' });

      try {
        const result = run(other.root, '--project-dir', project.root);
        expect(result.stdout).toContain(`${JS_ROW}\n`);
      } finally {
        other.cleanup();
      }
    });
  });

  describe('write', () => {
    it('updates the native files and reports what changed', () => {
      project = new TestProject({ version: '1.2.3' });

      expect(run(project.root, '--write')).toEqual({
        status: 0,
        stdout: [
          HEADER,
          JS_ROW,
          'android   com.testapp  1.2.3 (10203)  updated',
          'ios       com.testapp  1.2.3 (10203)  updated',
          '',
        ].join('\n'),
        stderr: '',
      });
      expect(project.readGradle()).toContain('versionCode 10203');
      expect(project.readPbxproj()).toContain('MARKETING_VERSION = 1.2.3;');
      expect(run(project.root).status).toBe(0);
    });

    it('reports platforms that were already in sync as unchanged', () => {
      project = new TestProject({
        version: '1.2.3',
        android: { versionName: '1.2.3', versionCode: 10203 },
      });

      const { stdout } = run(project.root, '--write');
      expect(stdout).toContain(
        'android   com.testapp  1.2.3 (10203)  unchanged\n',
      );
      expect(stdout).toContain(
        'ios       com.testapp  1.2.3 (10203)  updated\n',
      );
    });

    it('lists a missing platform as not found', () => {
      project = new TestProject({ version: '1.2.3', ios: false });

      const result = run(project.root, '--write');
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(
        `ios${' '.repeat(35)}not found, pass --skip-ios to ignore\n`,
      );
    });
  });

  describe('read', () => {
    const android = {
      versionName: '3.4.5',
      versionCode: 30405,
      applicationId: 'com.example.app',
    };
    const ios = [
      {
        name: 'Debug',
        version: '0.0.1',
        buildNumber: '1',
        bundleId: 'com.example.debug',
      },
      {
        name: 'Release',
        version: '3.4.5',
        buildNumber: '30405',
        bundleId: 'com.example.app',
      },
    ];

    it('prints single values read from the Android file', () => {
      project = new TestProject({ android, ios: false });

      expect(run(project.root, '--print-version-name', 'android')).toEqual({
        status: 0,
        stdout: '3.4.5\n',
        stderr: '',
      });
      expect(run(project.root, '--print-version-code', 'android').stdout).toBe(
        '30405\n',
      );
      expect(run(project.root, '--print-app-id', 'android').stdout).toBe(
        'com.example.app\n',
      );
    });

    it('prints single values read from the iOS file', () => {
      project = new TestProject({ android: false, ios });

      expect(run(project.root, '--print-version-name', 'ios').stdout).toBe(
        '3.4.5\n',
      );
      expect(run(project.root, '--print-version-code', 'ios').stdout).toBe(
        '30405\n',
      );
      expect(run(project.root, '--print-app-id', 'ios').stdout).toBe(
        'com.example.app\n',
      );
    });

    it('selects the iOS build configuration with --configuration', () => {
      project = new TestProject({ android: false, ios });

      const appId = run(
        project.root,
        '--print-app-id',
        'ios',
        '--configuration',
        'Debug',
      );
      expect(appId.stdout).toBe('com.example.debug\n');

      const versionCode = run(
        project.root,
        '--print-version-code',
        'ios',
        '--configuration',
        'Debug',
      );
      expect(versionCode.stdout).toBe('1\n');
    });

    it('prints all values with --print', () => {
      project = new TestProject({ android, ios: false });

      expect(run(project.root, '--print', 'android').stdout).toBe(
        'appId: com.example.app\nversionName: 3.4.5\nversionCode: 30405\n',
      );
    });

    it('fills the --format template', () => {
      project = new TestProject({ android, ios: false });

      const result = run(
        project.root,
        '--print',
        'android',
        '--format',
        '{appId}@{versionName}+{versionCode}',
      );
      expect(result.stdout).toBe('com.example.app@3.4.5+30405\n');
    });

    it('prints dotenv lines with --print-env', () => {
      project = new TestProject({ android, ios: false });

      expect(run(project.root, '--print-env', 'android').stdout).toBe(
        'APP_ID=com.example.app\nVERSION_NAME=3.4.5\nVERSION_CODE=30405\n',
      );
    });

    it('resolves --gradle-path and --pbxproj-path against --project-dir', () => {
      project = new TestProject({ android: false, ios: false });
      const custom = path.join(project.root, 'custom');
      fs.mkdirSync(custom);
      fs.writeFileSync(
        path.join(custom, 'build.gradle'),
        buildGradle({ versionCode: 7 }),
      );
      fs.writeFileSync(
        path.join(custom, 'project.pbxproj'),
        buildPbxproj([
          { name: 'App', configs: [{ name: 'Release', buildNumber: '8' }] },
        ]),
      );
      const other = new TestProject();

      try {
        const android = run(
          other.root,
          '--project-dir',
          project.root,
          '--print-version-code',
          'android',
          '--gradle-path',
          path.join('custom', 'build.gradle'),
        );
        expect(android.stdout).toBe('7\n');

        const ios = run(
          other.root,
          '--project-dir',
          project.root,
          '--print-version-code',
          'ios',
          '--pbxproj-path',
          path.join('custom', 'project.pbxproj'),
        );
        expect(ios.stdout).toBe('8\n');
      } finally {
        other.cleanup();
      }
    });
  });

  describe('option validation', () => {
    beforeEach(() => {
      project = new TestProject({ version: '1.2.3' });
    });

    function expectError(args: string[], stderr: string) {
      expect(run(project.root, ...args)).toEqual({
        status: 1,
        stdout: '',
        stderr,
      });
    }

    it('rejects a non-integer --version-code', () => {
      expectError(
        ['--version-code', '12abc'],
        "error: option '--version-code <code>' argument '12abc' is invalid. Not an integer.\n",
      );
    });

    it('rejects a fractional --reserve-builds', () => {
      expectError(
        ['--reserve-builds', '1.5'],
        "error: option '--reserve-builds <n>' argument '1.5' is invalid. Not an integer.\n",
      );
    });

    it('rejects a non-positive --version-code', () => {
      expectError(
        ['--version-code', '0'],
        'Error: version-code must be a positive integer\n',
      );
    });

    it('rejects --format without --print', () => {
      expectError(
        ['--format', '{appId}'],
        'Error: --format can only be used with --print\n',
      );
    });

    it('rejects --configuration outside iOS reads', () => {
      expectError(
        ['--print-app-id', 'android', '--configuration', 'Release'],
        'Error: --configuration does not apply to android\n',
      );
    });

    it('rejects --write combined with a print flag', () => {
      expectError(
        ['--write', '--print', 'android'],
        'Error: Only one of --print, --write may be used at a time\n',
      );
    });

    it('rejects more than one print flag', () => {
      expectError(
        ['--print-version-name', 'android', '--print-app-id', 'android'],
        'Error: Only one of --print-version-name, --print-app-id may be used at a time\n',
      );
    });

    it('rejects an unknown platform', () => {
      expectError(
        ['--print-version-name', 'web'],
        'Error: --print-version-name must be "android" or "ios"\n',
      );
    });
  });

  describe('meta', () => {
    it('prints the package version', () => {
      expect(run(root, '--version')).toEqual({
        status: 0,
        stdout: `${packageVersion}\n`,
        stderr: '',
      });
    });

    it('prints usage with --help', () => {
      const result = run(root, '--help');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Usage: rn-version-sync [options]');
      expect(result.stdout).toContain('--write');
      expect(result.stdout).toContain('--reserve-builds <n>');
    });
  });
});
