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
  if (
    manualVersionCode !== undefined &&
    (!Number.isInteger(manualVersionCode) || manualVersionCode < 1)
  ) {
    throw new Error('version-code must be a positive integer');
  }

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

export interface SyncResult {
  /** Path of the synced build.gradle; unset when skipped or not found */
  android?: string;
  /** Path of the synced project.pbxproj; unset when skipped or not found */
  ios?: string;
}

/**
 * Write the resolved version name and code to the native files of the
 * platforms that are not skipped. A platform whose file cannot be found is
 * skipped with a warning; when no file was synced at all, an error is thrown.
 */
export function syncVersions(
  projectRoot: string,
  options: SyncOptions = {},
): SyncResult {
  const { verbose = false } = options;
  const { versionName, versionCode } = resolveVersions(projectRoot, options);

  if (verbose) {
    console.log(`Syncing version name: ${versionName}`);
    console.log(`Using version code: ${versionCode}`);
  }

  const result: SyncResult = {};

  if (!options.skipAndroid) {
    const gradlePath = updateAndroidVersion(
      projectRoot,
      versionName,
      versionCode,
      verbose,
      options.gradlePath,
    );
    if (gradlePath) {
      result.android = gradlePath;
    } else {
      console.warn(
        'Warning: android/app/build.gradle not found, skipping Android. Pass --skip-android to silence this warning.',
      );
    }
  }

  if (!options.skipIos) {
    const pbxprojPath = updateIOSVersion(
      projectRoot,
      versionName,
      versionCode.toString(),
      verbose,
      options.pbxprojPath,
    );
    if (pbxprojPath) {
      result.ios = pbxprojPath;
    } else {
      console.warn(
        'Warning: ios/<Project>.xcodeproj/project.pbxproj not found, skipping iOS. Pass --skip-ios to silence this warning.',
      );
    }
  }

  if (!result.android && !result.ios) {
    throw new Error(
      options.skipAndroid && options.skipIos
        ? 'Nothing to sync: both platforms are skipped'
        : `No native project files found in ${projectRoot}.\n` +
            `Expected android/app/build.gradle or ios/<Project>.xcodeproj/project.pbxproj; ` +
            `use --gradle-path or --pbxproj-path for other locations.`,
    );
  }

  return result;
}

export interface ReadOptions {
  gradlePath?: string;
  pbxprojPath?: string;
  /** Xcode build configuration to read the iOS values from (default: Release) */
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
    : getIOSVersions(projectRoot, options.pbxprojPath, options.configuration);
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

// Lower-level platform functions for programmatic use
export {
  getAndroidAppId,
  getAndroidVersions,
  updateAndroidVersion,
} from './android';
export { getIOSAppId, getIOSVersions, updateIOSVersion } from './ios';
export { getPackageVersion } from './utils';
