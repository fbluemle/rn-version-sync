import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { TestProject } from './helpers';

const INVALID = 'Invalid "rn-version-sync" configuration in package.json: ';

describe('loadConfig', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('returns an empty configuration without the package.json key', () => {
    project = new TestProject({ android: false, ios: false });

    expect(loadConfig(project.root)).toEqual({});
  });

  it('returns an empty configuration when package.json is missing', () => {
    project = new TestProject({ android: false, ios: false });
    fs.rmSync(path.join(project.root, 'package.json'));

    expect(loadConfig(project.root)).toEqual({});
  });

  it('reads the settings and resolves paths against the project directory', () => {
    project = new TestProject({
      android: false,
      ios: false,
      config: {
        reserveBuilds: 100,
        gradlePath: 'app/build.gradle',
        pbxprojPath: '/elsewhere/App.xcodeproj/project.pbxproj',
        configuration: 'Staging',
        skipAndroid: false,
        skipIos: true,
      },
    });

    expect(loadConfig(project.root)).toEqual({
      reserveBuilds: 100,
      gradlePath: path.join(project.root, 'app', 'build.gradle'),
      pbxprojPath: '/elsewhere/App.xcodeproj/project.pbxproj',
      configuration: 'Staging',
      skipAndroid: false,
      skipIos: true,
    });
  });

  it('rejects a configuration that is not an object', () => {
    for (const config of [null, 100, 'reserveBuilds', [100]]) {
      project = new TestProject({ android: false, ios: false, config });

      expect(() => loadConfig(project.root)).toThrow(
        `${INVALID}must be an object`,
      );
      project.cleanup();
    }
  });

  it('rejects an unknown setting', () => {
    project = new TestProject({
      android: false,
      ios: false,
      config: { reserveBuild: 100 },
    });

    expect(() => loadConfig(project.root)).toThrow(
      `${INVALID}unknown setting "reserveBuild" (available: reserveBuilds, gradlePath, pbxprojPath, configuration, skipAndroid, skipIos)`,
    );
  });

  it('rejects values of the wrong type', () => {
    const cases: [unknown, string][] = [
      [{ reserveBuilds: '100' }, 'reserveBuilds must be a positive integer'],
      [{ reserveBuilds: 0 }, 'reserveBuilds must be a positive integer'],
      [{ reserveBuilds: 1.5 }, 'reserveBuilds must be a positive integer'],
      [{ gradlePath: 5 }, 'gradlePath must be a string'],
      [{ pbxprojPath: null }, 'pbxprojPath must be a string'],
      [{ configuration: true }, 'configuration must be a string'],
      [{ skipAndroid: 'yes' }, 'skipAndroid must be a boolean'],
      [{ skipIos: 1 }, 'skipIos must be a boolean'],
    ];

    for (const [config, message] of cases) {
      project = new TestProject({ android: false, ios: false, config });

      expect(() => loadConfig(project.root)).toThrow(`${INVALID}${message}`);
      project.cleanup();
    }
  });
});
