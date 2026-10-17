import * as path from 'node:path';
import { readPackageJson } from './utils';

/** Key of package.json that holds the project configuration */
const CONFIG_KEY = 'rnVersionSync';

/** Deprecated key, still read with a warning until 1.0.0 */
const LEGACY_CONFIG_KEY = 'rn-version-sync';

/** Project directories already warned about the deprecated key */
const warnedLegacyKey = new Set<string>();

/**
 * Project-wide defaults, stored under the "rnVersionSync" key of
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

function invalid(key: string, problem: string): Error {
  return new Error(
    `Invalid "${key}" configuration in package.json: ${problem}`,
  );
}

/**
 * Find the configuration in package.json, falling back to the deprecated key
 * with a warning printed once per project directory.
 */
function readRawConfig(projectRoot: string): { key: string; raw: unknown } {
  const packageJson = readPackageJson(projectRoot);
  if (packageJson[LEGACY_CONFIG_KEY] === undefined) {
    return { key: CONFIG_KEY, raw: packageJson[CONFIG_KEY] };
  }
  if (packageJson[CONFIG_KEY] !== undefined) {
    throw new Error(
      `package.json has both "${CONFIG_KEY}" and "${LEGACY_CONFIG_KEY}" keys; remove "${LEGACY_CONFIG_KEY}"`,
    );
  }
  const resolvedRoot = path.resolve(projectRoot);
  if (!warnedLegacyKey.has(resolvedRoot)) {
    warnedLegacyKey.add(resolvedRoot);
    console.warn(
      `Warning: the "${LEGACY_CONFIG_KEY}" key in package.json is deprecated and will no longer be read in 1.0.0; rename it to "${CONFIG_KEY}"`,
    );
  }
  return { key: LEGACY_CONFIG_KEY, raw: packageJson[LEGACY_CONFIG_KEY] };
}

/**
 * Read the project configuration from package.json. A missing key yields an
 * empty configuration. Unknown settings and values of the wrong type are
 * errors, and relative paths are resolved against the project directory.
 */
export function loadConfig(projectRoot: string): ProjectConfig {
  const { key: configKey, raw } = readRawConfig(projectRoot);
  if (raw === undefined) {
    return {};
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalid(configKey, 'must be an object');
  }

  for (const [key, value] of Object.entries(raw)) {
    if (!isSetting(key)) {
      const available = Object.keys(SETTINGS).join(', ');
      throw invalid(
        configKey,
        `unknown setting "${key}" (available: ${available})`,
      );
    }
    if (!SETTINGS[key].isValid(value)) {
      throw invalid(configKey, `${key} must be ${SETTINGS[key].expected}`);
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
