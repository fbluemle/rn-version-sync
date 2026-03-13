import {updateAndroidVersion} from './android';
import {updateIOSVersion} from './ios';
import {getPackageVersion, calculateVersionCode, MAX_VERSION_CODE} from './utils';

export interface SyncOptions {
  verbose?: boolean;
  versionName?: string;
  versionCode?: number;
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

  if (manualVersionCode !== undefined && manualVersionCode > MAX_VERSION_CODE) {
    throw new Error(
      `Version code ${manualVersionCode} exceeds maximum value ${MAX_VERSION_CODE}.\n` +
      `Android and iOS use 32-bit signed integers for version codes.`
    );
  }

  const versionName = options.versionName ?? getPackageVersion(projectRoot);
  const versionCode = manualVersionCode ?? calculateVersionCode(versionName);

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
export {updateAndroidVersion} from './android';
export {updateIOSVersion} from './ios';
export {getPackageVersion} from './utils';
