import {updateAndroidVersion, getAndroidVersions} from './android';
import {updateIOSVersion, getIOSVersions} from './ios';
import {getPackageVersion, calculateVersionCode, MAX_VERSION_CODE} from './utils';

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
export function resolveVersions(projectRoot: string, options: SyncOptions = {}): ResolvedVersions {
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
      `Android and iOS use 32-bit signed integers for version codes.`
    );
  }

  return {versionName, versionCode};
}

/**
 * Main function to sync versions
 */
export function syncVersions(projectRoot: string, options: SyncOptions = {}): void {
  const {verbose = false} = options;
  const {versionName, versionCode} = resolveVersions(projectRoot, options);

  if (verbose) {
    console.log(`Syncing version name: ${versionName}`);
    console.log(`Using version code: ${versionCode}`);
  }

  if (!options.skipAndroid) {
    updateAndroidVersion(projectRoot, versionName, versionCode, verbose, options.gradlePath);
  }

  if (!options.skipIos) {
    updateIOSVersion(projectRoot, versionName, versionCode.toString(), verbose, options.pbxprojPath);
  }
}

// Re-export utilities for testing
export {updateAndroidVersion, getAndroidVersions} from './android';
export {updateIOSVersion, getIOSVersions} from './ios';
export {getPackageVersion} from './utils';
