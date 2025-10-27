import * as fs from 'fs';
import * as path from 'path';

export interface SemverComponents {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Read version from package.json
 */
export function getPackageVersion(projectRoot: string): string {
  const packagePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error(
      `package.json not found at: ${packagePath}\n` +
      `Make sure you're running this command from your React Native project root.`
    );
  }

  let packageJson: any;
  try {
    packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Failed to parse package.json at: ${packagePath}\n` +
      `Error: ${(error as Error).message}`
    );
  }

  if (!packageJson.version) {
    throw new Error(
      `No "version" field found in package.json at: ${packagePath}\n` +
      `Add a version field like: "version": "1.0.0"`
    );
  }

  return packageJson.version;
}

/**
 * Parse semver string into components
 */
export function parseSemver(version: string): SemverComponents {
  // Remove any pre-release or metadata (e.g., "1.2.3-beta.1+build.123" -> "1.2.3")
  const cleanVersion = version.split('-')[0].split('+')[0];

  const parts = cleanVersion.split('.');
  if (parts.length !== 3) {
    throw new Error(
      `Invalid semver format: "${version}"\n` +
      `Expected format: MAJOR.MINOR.PATCH (e.g., "1.2.3")`
    );
  }

  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  const patch = parseInt(parts[2], 10);

  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    throw new Error(
      `Invalid semver format: "${version}"\n` +
      `Version components must be numbers (got: ${parts[0]}.${parts[1]}.${parts[2]})`
    );
  }

  return {major, minor, patch};
}

/**
 * Maximum safe version code for 32-bit signed integers (Android/iOS constraint)
 */
const MAX_VERSION_CODE = 2147483647;

/**
 * Calculate version code from semver using formula: 10000*major + 100*minor + patch
 */
export function calculateVersionCode(version: string): number {
  const {major, minor, patch} = parseSemver(version);
  const versionCode = 10000 * major + 100 * minor + patch;

  if (versionCode > MAX_VERSION_CODE) {
    throw new Error(
      `Calculated version code ${versionCode} exceeds maximum value ${MAX_VERSION_CODE}.\n` +
      `Version ${version} is too high for the formula (10000*major + 100*minor + patch).\n` +
      `Use --version-code flag to manually specify a version code.`
    );
  }

  return versionCode;
}
