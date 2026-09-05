import {
  getAndroidAppId,
  getAndroidVersions,
  locateBuildGradle,
  updateAndroidVersion,
} from './android';
import { type ProjectConfig, loadConfig } from './config';
import {
  getIOSAppId,
  getIOSVersions,
  locatePbxproj,
  updateIOSVersion,
} from './ios';
import {
  MAX_VERSION_CODE,
  calculateVersionCode,
  getPackageInfo,
  getPackageVersion,
} from './utils';

export type Platform = 'android' | 'ios';

export type ReadOptions = Pick<
  ProjectConfig,
  'gradlePath' | 'pbxprojPath' | 'configuration'
>;

/**
 * Project configuration plus the per-invocation overrides. Options left
 * undefined are filled in from the "rn-version-sync" key of package.json.
 */
export interface SyncOptions extends ProjectConfig {
  versionName?: string;
  versionCode?: number;
}

/**
 * Fill options left undefined with the project configuration from
 * package.json, so an explicit option takes precedence over the configured
 * value.
 */
function withConfig<T extends ReadOptions>(projectRoot: string, options: T): T {
  const merged: Record<string, unknown> = { ...options };
  for (const [key, value] of Object.entries(loadConfig(projectRoot))) {
    merged[key] ??= value;
  }
  return merged as T;
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
  return resolveTarget(projectRoot, withConfig(projectRoot, options));
}

function resolveTarget(
  projectRoot: string,
  options: SyncOptions,
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

function readValues(
  projectRoot: string,
  platform: Platform,
  options: ReadOptions,
): NativeValues {
  return {
    appId: readAppId(projectRoot, platform, options),
    ...readVersions(projectRoot, platform, options),
  };
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
  return readValues(projectRoot, platform, withConfig(projectRoot, options));
}

export interface PlatformStatus extends NativeValues {
  platform: Platform;
  /** Native file the values were read from */
  path: string;
  /** Whether versionName and versionCode match the target */
  inSync: boolean;
}

export interface VersionStatus {
  /** The "name" field of package.json, if present */
  packageName?: string;
  /** The "version" field of package.json as written, if present */
  packageVersion?: string;
  /** Version name and code to compare against and write */
  target: ResolvedVersions;
  /** Whether versionName or versionCode replaced the package.json values */
  overridden: boolean;
  /** Platforms that are not skipped and whose native file was found */
  platforms: PlatformStatus[];
  /** Platforms that are not skipped but whose native file was not found */
  missing: Platform[];
}

export interface SyncStatus extends VersionStatus {
  platforms: (PlatformStatus & { updated: boolean })[];
}

interface NativeFile {
  platform: Platform;
  path: string;
}

/**
 * Native files of the platforms that are not skipped, and the platforms
 * whose file cannot be found. Throws when no file is left.
 */
function locateNativeFiles(
  projectRoot: string,
  options: SyncOptions,
): { files: NativeFile[]; missing: Platform[] } {
  const files: NativeFile[] = [];
  const missing: Platform[] = [];

  if (!options.skipAndroid) {
    const path = locateBuildGradle(projectRoot, options.gradlePath);
    if (path) {
      files.push({ platform: 'android', path });
    } else {
      missing.push('android');
    }
  }

  if (!options.skipIos) {
    const path = locatePbxproj(projectRoot, options.pbxprojPath);
    if (path) {
      files.push({ platform: 'ios', path });
    } else {
      missing.push('ios');
    }
  }

  if (files.length === 0) {
    throw new Error(
      options.skipAndroid && options.skipIos
        ? 'Nothing to sync: both platforms are skipped'
        : `No native project files found in ${projectRoot}.\n` +
            `Expected android/app/build.gradle or ios/<Project>.xcodeproj/project.pbxproj; ` +
            `use --gradle-path or --pbxproj-path for other locations.`,
    );
  }

  return { files, missing };
}

function readPlatformStatus(
  projectRoot: string,
  file: NativeFile,
  target: ResolvedVersions,
  configuration?: string,
): PlatformStatus {
  const values = readValues(
    projectRoot,
    file.platform,
    file.platform === 'android'
      ? { gradlePath: file.path }
      : { pbxprojPath: file.path, configuration },
  );

  return {
    platform: file.platform,
    path: file.path,
    ...values,
    inSync:
      values.versionName === target.versionName &&
      values.versionCode === String(target.versionCode),
  };
}

/**
 * Compare the native files with the resolved version name and code without
 * writing anything.
 */
export function checkVersions(
  projectRoot: string,
  options: SyncOptions = {},
): VersionStatus {
  const opts = withConfig(projectRoot, options);
  const { name, version } = getPackageInfo(projectRoot);
  const target = resolveTarget(projectRoot, opts);
  const { files, missing } = locateNativeFiles(projectRoot, opts);

  return {
    packageName: name,
    packageVersion: version,
    target,
    overridden:
      opts.versionName !== undefined || opts.versionCode !== undefined,
    platforms: files.map((file) =>
      readPlatformStatus(projectRoot, file, target, opts.configuration),
    ),
    missing,
  };
}

/**
 * Write the resolved version name and code to the native files of the
 * platforms that are not skipped and report their state afterwards. A
 * platform whose file cannot be found is listed as missing; when no file is
 * left, an error is thrown.
 */
export function syncVersions(
  projectRoot: string,
  options: SyncOptions = {},
): SyncStatus {
  const before = checkVersions(projectRoot, options);
  const { versionName, versionCode } = before.target;

  for (const { platform, path } of before.platforms) {
    if (platform === 'android') {
      updateAndroidVersion(projectRoot, versionName, versionCode, path);
    } else {
      updateIOSVersion(projectRoot, versionName, versionCode.toString(), path);
    }
  }

  const after = checkVersions(projectRoot, options);
  return {
    ...after,
    platforms: after.platforms.map((platform, i) => ({
      ...platform,
      updated: !before.platforms[i].inSync,
    })),
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
  const opts = withConfig(projectRoot, options);
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
      appId ??= readAppId(projectRoot, platform, opts);
      return appId;
    }
    versions ??= readVersions(projectRoot, platform, opts);
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
export { type ProjectConfig, loadConfig } from './config';
export { getIOSAppId, getIOSVersions, updateIOSVersion } from './ios';
export { getPackageVersion } from './utils';
