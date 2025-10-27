import {updateAndroidVersion} from './android';
import {updateIOSVersion} from './ios';
import {getPackageVersion, calculateVersionCode} from './utils';

export interface SyncOptions {
  verbose?: boolean;
  versionCode?: number;
}

const MAX_VERSION_CODE = 2147483647;

/**
 * Main function to sync versions
 */
export function syncVersions(projectRoot: string, options: SyncOptions = {}): void {
  const {verbose = false, versionCode: manualVersionCode} = options;

  const versionName = getPackageVersion(projectRoot);
  const versionCode = manualVersionCode ?? calculateVersionCode(versionName);

  // Validate manual version code override
  if (manualVersionCode !== undefined && manualVersionCode > MAX_VERSION_CODE) {
    throw new Error(
      `Version code ${manualVersionCode} exceeds maximum value ${MAX_VERSION_CODE}.\n` +
      `Android and iOS use 32-bit signed integers for version codes.`
    );
  }

  if (verbose) {
    console.log(`Syncing version name: ${versionName}`);
    console.log(`Using version code: ${versionCode}`);
  }

  // Update Android with separate version name and code
  updateAndroidVersion(projectRoot, versionName, versionCode, verbose);

  // Update iOS with separate version name and code
  updateIOSVersion(projectRoot, versionName, versionCode.toString(), verbose);
}

// Re-export utilities for testing
export {updateAndroidVersion} from './android';
export {updateIOSVersion} from './ios';
export {getPackageVersion} from './utils';
