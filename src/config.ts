import * as path from 'node:path';
import { readPackageJson } from './utils';

/** Key of package.json that holds the project configuration */
const CONFIG_KEY = 'rn-version-sync';

/**
 * Project-wide defaults, stored under the "rn-version-sync" key of
 * package.json. Each setting has a CLI option of the same name, and an
 * explicit option takes precedence over the configured value.
 */
export interface ProjectConfig {
  /** Version codes each version owns; multiplies the calculated code */
  reserveBuilds?: number;
  /** Android build.gradle, relative to the project directory */
  gradlePath?: string;
  /** iOS project.pbxproj, relative to the project directory */
  pbxprojPath?: string;
  /** Xcode build configuration to read the iOS values from (default: Release) */
  configuration?: string;
  /** Ignore the Android project */
  skipAndroid?: boolean;
  /** Ignore the iOS project */
  skipIos?: boolean;
}

interface Setting {
  /** Description of the accepted values, for error messages */
  expected: string;
  isValid: (value: unknown) => boolean;
}

const STRING: Setting = {
  expected: 'a string',
  isValid: (value) => typeof value === 'string',
};

const BOOLEAN: Setting = {
  expected: 'a boolean',
  isValid: (value) => typeof value === 'boolean',
};

const SETTINGS: Record<keyof ProjectConfig, Setting> = {
  reserveBuilds: {
    expected: 'a positive integer',
    isValid: (value) => Number.isInteger(value) && (value as number) >= 1,
  },
  gradlePath: STRING,
  pbxprojPath: STRING,
  configuration: STRING,
  skipAndroid: BOOLEAN,
  skipIos: BOOLEAN,
};

function isSetting(key: string): key is keyof ProjectConfig {
  return (Object.keys(SETTINGS) as string[]).includes(key);
}

function invalid(problem: string): Error {
  return new Error(
    `Invalid "${CONFIG_KEY}" configuration in package.json: ${problem}`,
  );
}

/**
 * Read the project configuration from package.json. A missing key yields an
 * empty configuration. Unknown settings and values of the wrong type are
 * errors, and relative paths are resolved against the project directory.
 */
export function loadConfig(projectRoot: string): ProjectConfig {
  const raw = readPackageJson(projectRoot)[CONFIG_KEY];
  if (raw === undefined) {
    return {};
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalid('must be an object');
  }

  for (const [key, value] of Object.entries(raw)) {
    if (!isSetting(key)) {
      const available = Object.keys(SETTINGS).join(', ');
      throw invalid(`unknown setting "${key}" (available: ${available})`);
    }
    if (!SETTINGS[key].isValid(value)) {
      throw invalid(`${key} must be ${SETTINGS[key].expected}`);
    }
  }

  const config: ProjectConfig = { ...raw };
  if (config.gradlePath !== undefined) {
    config.gradlePath = path.resolve(projectRoot, config.gradlePath);
  }
  if (config.pbxprojPath !== undefined) {
    config.pbxprojPath = path.resolve(projectRoot, config.pbxprojPath);
  }
  return config;
}
