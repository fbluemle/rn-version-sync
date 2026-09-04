import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Locate build.gradle: the explicit path when given (which must exist),
 * otherwise android/app/build.gradle if present.
 */
function locateBuildGradle(
  projectRoot: string,
  explicitGradlePath?: string,
): string | null {
  if (explicitGradlePath) {
    if (!fs.existsSync(explicitGradlePath)) {
      throw new Error(
        `build.gradle not found at specified path: ${explicitGradlePath}`,
      );
    }
    return explicitGradlePath;
  }

  const buildGradlePath = path.join(
    projectRoot,
    'android',
    'app',
    'build.gradle',
  );
  return fs.existsSync(buildGradlePath) ? buildGradlePath : null;
}

function readBuildGradle(
  projectRoot: string,
  explicitGradlePath?: string,
): {
  buildGradlePath: string;
  content: string;
} {
  const buildGradlePath = locateBuildGradle(projectRoot, explicitGradlePath);

  if (!buildGradlePath) {
    throw new Error('Could not find Android build.gradle');
  }

  return { buildGradlePath, content: fs.readFileSync(buildGradlePath, 'utf8') };
}

/**
 * Read versionName and versionCode from build.gradle as written.
 * Returns the first match for each. versionCode is returned as a string to
 * preserve the file representation.
 */
export function getAndroidVersions(
  projectRoot: string,
  explicitGradlePath?: string,
): { versionName: string; versionCode: string } {
  const { buildGradlePath, content } = readBuildGradle(
    projectRoot,
    explicitGradlePath,
  );

  const nameMatch = content.match(/versionName\s+["']([^"']+)["']/);
  const codeMatch = content.match(/versionCode\s+(\d+)/);

  if (!nameMatch) {
    throw new Error(`No versionName found in ${buildGradlePath}`);
  }
  if (!codeMatch) {
    throw new Error(`No versionCode found in ${buildGradlePath}`);
  }

  return { versionName: nameMatch[1], versionCode: codeMatch[1] };
}

/**
 * Read the applicationId literal from build.gradle. Fails when several
 * distinct literals are present (for example a flavor override), since the
 * effective id then depends on the build variant.
 */
export function getAndroidAppId(
  projectRoot: string,
  explicitGradlePath?: string,
): string {
  const { buildGradlePath, content } = readBuildGradle(
    projectRoot,
    explicitGradlePath,
  );

  const ids = [...content.matchAll(/\bapplicationId\s+["']([^"']+)["']/g)].map(
    ([, id]) => id,
  );
  const distinct = [...new Set(ids)];

  if (distinct.length === 0) {
    throw new Error(`No applicationId found in ${buildGradlePath}`);
  }
  if (distinct.length > 1) {
    const values = distinct.map((id) => `"${id}"`).join(', ');
    throw new Error(
      `Multiple applicationId values found in ${buildGradlePath}: ${values}.\n` +
        `The effective id depends on the build variant, which cannot be resolved from the file.`,
    );
  }

  return distinct[0];
}

/**
 * Update Android build.gradle with new version name and version code.
 * Returns the path of the file, or null when no build.gradle was found.
 * Throws when the file has no versionName or versionCode.
 */
export function updateAndroidVersion(
  projectRoot: string,
  versionName: string,
  versionCode: number,
  verbose: boolean,
  explicitGradlePath?: string,
): string | null {
  const buildGradlePath = locateBuildGradle(projectRoot, explicitGradlePath);

  if (!buildGradlePath) {
    return null;
  }

  let content = fs.readFileSync(buildGradlePath, 'utf8');
  let modified = false;

  // Update versionName
  const versionNameRegex = /(versionName\s+["'])([^"']*)(['"])/;
  if (!versionNameRegex.test(content)) {
    throw new Error(`No versionName found in ${buildGradlePath}`);
  }
  const withVersionName = content.replace(
    versionNameRegex,
    `$1${versionName}$3`,
  );
  if (withVersionName !== content) {
    content = withVersionName;
    modified = true;
    if (verbose) console.log(`Updated versionName to ${versionName}`);
  }

  // Update versionCode with calculated value
  const versionCodeRegex = /(versionCode\s+)(\d+)/;
  if (!versionCodeRegex.test(content)) {
    throw new Error(`No versionCode found in ${buildGradlePath}`);
  }
  const withVersionCode = content.replace(versionCodeRegex, `$1${versionCode}`);
  if (withVersionCode !== content) {
    content = withVersionCode;
    modified = true;
    if (verbose) console.log(`Updated versionCode to ${versionCode}`);
  }

  if (modified) {
    fs.writeFileSync(buildGradlePath, content, 'utf8');
    if (verbose) console.log(`Updated ${buildGradlePath}`);
  }

  return buildGradlePath;
}
