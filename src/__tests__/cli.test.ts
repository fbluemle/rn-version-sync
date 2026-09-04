import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestProject, buildGradle } from './helpers';

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

const SUCCESS = '✓ Version sync completed successfully\n';

describe('cli', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  describe('sync', () => {
    it('syncs both platforms and reports success', () => {
      project = new TestProject({ version: '1.2.3' });

      expect(run(project.root)).toEqual({
        status: 0,
        stdout: SUCCESS,
        stderr: '',
      });
      expect(project.readGradle()).toContain('versionCode 10203');
      expect(project.readPbxproj()).toContain('MARKETING_VERSION = 1.2.3;');
    });

    it('warns about a missing platform and exits 0', () => {
      project = new TestProject({ version: '1.2.3', ios: false });

      expect(run(project.root)).toEqual({
        status: 0,
        stdout: SUCCESS,
        stderr:
          'Warning: ios/<Project>.xcodeproj/project.pbxproj not found, skipping iOS. Pass --skip-ios to silence this warning.\n',
      });
    });

    it('does not warn about a skipped platform', () => {
      project = new TestProject({ version: '1.2.3', ios: false });

      expect(run(project.root, '--skip-ios').stderr).toBe('');
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

    it('prints the resolved values with --dry-run without writing', () => {
      project = new TestProject({ version: '1.2.3' });

      expect(run(project.root, '--dry-run')).toEqual({
        status: 0,
        stdout: 'versionName: 1.2.3\nversionCode: 10203\n',
        stderr: '',
      });
      expect(project.readGradle()).toContain('versionCode 1');
    });

    it('applies --version-name and --reserve-builds', () => {
      project = new TestProject({ version: '1.2.3' });

      const result = run(
        project.root,
        '--dry-run',
        '--version-name',
        '2.0.0',
        '--reserve-builds',
        '100',
      );
      expect(result.stdout).toBe('versionName: 2.0.0\nversionCode: 2000000\n');
    });

    it('applies --version-code as given', () => {
      project = new TestProject({ version: '1.2.3' });

      expect(
        run(project.root, '--dry-run', '--version-code', '42').stdout,
      ).toBe('versionName: 1.2.3\nversionCode: 42\n');
    });

    it('uses --project-dir instead of the working directory', () => {
      project = new TestProject({ version: '1.2.3' });
      const other = new TestProject({ version: '9.9.9' });

      try {
        const result = run(
          other.root,
          '--project-dir',
          project.root,
          '--dry-run',
        );
        expect(result.stdout).toBe('versionName: 1.2.3\nversionCode: 10203\n');
      } finally {
        other.cleanup();
      }
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
        version: '3.4.5',
        buildNumber: '30405',
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

      const result = run(
        project.root,
        '--print-app-id',
        'ios',
        '--configuration',
        'Debug',
      );
      expect(result.stdout).toBe('com.example.debug\n');
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

    it('resolves --gradle-path relative to the working directory', () => {
      project = new TestProject({ android: false, ios: false });
      const gradlePath = path.join('custom', 'build.gradle');
      fs.mkdirSync(path.join(project.root, 'custom'));
      fs.writeFileSync(
        path.join(project.root, gradlePath),
        buildGradle({ versionCode: 7 }),
      );

      const result = run(
        project.root,
        '--print-version-code',
        'android',
        '--gradle-path',
        gradlePath,
      );
      expect(result.stdout).toBe('7\n');
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
        ['--dry-run', '--version-code', '12abc'],
        "error: option '--version-code <code>' argument '12abc' is invalid. Not an integer.\n",
      );
    });

    it('rejects a fractional --reserve-builds', () => {
      expectError(
        ['--dry-run', '--reserve-builds', '1.5'],
        "error: option '--reserve-builds <n>' argument '1.5' is invalid. Not an integer.\n",
      );
    });

    it('rejects a non-positive --version-code', () => {
      expectError(
        ['--dry-run', '--version-code', '0'],
        'Error: version-code must be a positive integer\n',
      );
    });

    it('rejects --format without --print', () => {
      expectError(
        ['--format', '{appId}'],
        'Error: --format can only be used with --print\n',
      );
    });

    it('rejects --configuration outside iOS app id reads', () => {
      expectError(
        ['--print-app-id', 'android', '--configuration', 'Release'],
        'Error: --configuration can only be used with --print-app-id, --print-env or --print for ios\n',
      );
    });

    it('rejects --dry-run combined with a print flag', () => {
      expectError(
        ['--dry-run', '--print', 'android'],
        'Error: Only one of --print, --dry-run may be used at a time\n',
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
      expect(result.stdout).toContain('--reserve-builds <n>');
    });
  });
});
