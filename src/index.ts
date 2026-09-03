import {
  getAndroidAppId,
  getAndroidVersions,
  updateAndroidVersion,
} from './android';
import { getIOSAppId, getIOSVersions, updateIOSVersion } from './ios';
import {
  MAX_VERSION_CODE,
  calculateVersionCode,
  getPackageVersion,
} from './utils';

export type Platform = 'android' | 'ios';

export interface SyncOptions {
  verbose?: boolean;
  versionName?: string;
  versionCode?: number;
  reserveBuilds?: number;
  gradlePath?: string;
  pbxprojPath?: string;
  skipAndroid?: boolean;
  skipIos?: boolean;
}

export interface ResolvedVersions {
  versionName: string;
  versionCode: number;
}

/**
 * Resolve version name and code from options without writing any files
 */
export function resolveVersions(
  projectRoot: string,
  options: SyncOptions = {},
): ResolvedVersions {
  const manualVersionCode = options.versionCode;
  const versionName = options.versionName ?? getPackageVersion(projectRoot);
  let versionCode = manualVersionCode ?? calculateVersionCode(versionName);

  if (options.reserveBuilds !== undefined && manualVersionCode === undefined) {
    if (!Number.isInteger(options.reserveBuilds) || options.reserveBuilds < 1) {
      throw new Error('reserve-builds must be a positive integer');
    }
    versionCode *= options.reserveBuilds;
  }

  if (versionCode > MAX_VERSION_CODE) {
    throw new Error(
      `Version code ${versionCode} exceeds maximum value ${MAX_VERSION_CODE}.\n` +
        `Android and iOS use 32-bit signed integers for version codes.`,
    );
  }

  return { versionName, versionCode };
}

/**
 * Main function to sync versions
 */
export function syncVersions(
  projectRoot: string,
  options: SyncOptions = {},
): void {
  const { verbose = false } = options;
  const { versionName, versionCode } = resolveVersions(projectRoot, options);

  if (verbose) {
    console.log(`Syncing version name: ${versionName}`);
    console.log(`Using version code: ${versionCode}`);
  }

  if (!options.skipAndroid) {
    updateAndroidVersion(
      projectRoot,
      versionName,
      versionCode,
      verbose,
      options.gradlePath,
    );
  }

  if (!options.skipIos) {
    updateIOSVersion(
      projectRoot,
      versionName,
      versionCode.toString(),
      verbose,
      options.pbxprojPath,
    );
  }
}

export interface ReadOptions {
  gradlePath?: string;
  pbxprojPath?: string;
  /** Xcode build configuration for the iOS app id (default: Release) */
  configuration?: string;
}

export interface NativeValues {
  appId: string;
  versionName: string;
  versionCode: string;
}

function readAppId(
  projectRoot: string,
  platform: Platform,
  options: ReadOptions,
): string {
  return platform === 'android'
    ? getAndroidAppId(projectRoot, options.gradlePath)
    : getIOSAppId(projectRoot, options.pbxprojPath, options.configuration);
}

function readVersions(
  projectRoot: string,
  platform: Platform,
  options: ReadOptions,
): Omit<NativeValues, 'appId'> {
  return platform === 'android'
    ? getAndroidVersions(projectRoot, options.gradlePath)
    : getIOSVersions(projectRoot, options.pbxprojPath);
}

/**
 * Read app id, version name and version code of one platform as written in
 * its native build file.
 */
export function readNativeValues(
  projectRoot: string,
  platform: Platform,
  options: ReadOptions = {},
): NativeValues {
  return {
    appId: readAppId(projectRoot, platform, options),
    ...readVersions(projectRoot, platform, options),
  };
}

const PLACEHOLDERS = ['appId', 'versionName', 'versionCode'] as const;
type Placeholder = (typeof PLACEHOLDERS)[number];

function isPlaceholder(name: string): name is Placeholder {
  return (PLACEHOLDERS as readonly string[]).includes(name);
}

/**
 * Fill the {appId}, {versionName} and {versionCode} placeholders of a
 * template with the values of one platform. Only referenced values are
 * read, so a template without {appId} works where the app id cannot be
 * resolved. Values are inserted as written in the native file.
 */
export function formatTemplate(
  template: string,
  projectRoot: string,
  platform: Platform,
  options: ReadOptions = {},
): string {
  let appId: string | undefined;
  let versions: Omit<NativeValues, 'appId'> | undefined;

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!isPlaceholder(name)) {
      const available = PLACEHOLDERS.map((p) => `{${p}}`).join(', ');
      throw new Error(
        `Unknown placeholder ${match} in template (available: ${available})`,
      );
    }
    if (name === 'appId') {
      appId ??= readAppId(projectRoot, platform, options);
      return appId;
    }
    versions ??= readVersions(projectRoot, platform, options);
    return versions[name];
  });
}

const ENV_VALUE = /^[A-Za-z0-9._+-]+$/;

/**
 * Render native values as dotenv lines APP_ID, VERSION_NAME and
 * VERSION_CODE. Values are limited to [A-Za-z0-9._+-] so the output can be
 * eval'd in a shell or appended to GITHUB_ENV without quoting.
 */
export function formatEnv(values: NativeValues): string {
  const entries: [string, string][] = [
    ['APP_ID', values.appId],
    ['VERSION_NAME', values.versionName],
    ['VERSION_CODE', values.versionCode],
  ];

  let output = '';
  for (const [key, value] of entries) {
    if (!ENV_VALUE.test(value)) {
      throw new Error(
        `${key} value "${value}" contains characters outside [A-Za-z0-9._+-] and cannot be printed as an environment variable`,
      );
    }
    output += `${key}=${value}\n`;
  }
  return output;
}

// Re-export utilities for testing
export {
  getAndroidAppId,
  getAndroidVersions,
  updateAndroidVersion,
} from './android';
export { getIOSAppId, getIOSVersions, updateIOSVersion } from './ios';
export { getPackageVersion } from './utils';
