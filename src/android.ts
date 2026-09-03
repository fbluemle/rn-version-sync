import * as fs from 'fs';
import * as path from 'path';

/**
 * Find build.gradle file in Android directory
 */
function findBuildGradle(projectRoot: string): string | null {
  const androidDir = path.join(projectRoot, 'android', 'app');
  const buildGradlePath = path.join(androidDir, 'build.gradle');

  if (fs.existsSync(buildGradlePath)) {
    return buildGradlePath;
  }

  return null;
}

function readBuildGradle(projectRoot: string, explicitGradlePath?: string): {
  buildGradlePath: string;
  content: string;
} {
  if (explicitGradlePath && !fs.existsSync(explicitGradlePath)) {
    throw new Error(`build.gradle not found at specified path: ${explicitGradlePath}`);
  }

  const buildGradlePath = explicitGradlePath ?? findBuildGradle(projectRoot);

  if (!buildGradlePath) {
    throw new Error('Could not find Android build.gradle');
  }

  return {buildGradlePath, content: fs.readFileSync(buildGradlePath, 'utf8')};
}

/**
 * Read versionName and versionCode from build.gradle as written.
 * Returns the first match for each. versionCode is returned as a string to
 * preserve the file representation.
 */
export function getAndroidVersions(
  projectRoot: string,
  explicitGradlePath?: string
): {versionName: string; versionCode: string} {
  const {buildGradlePath, content} = readBuildGradle(projectRoot, explicitGradlePath);

  const nameMatch = content.match(/versionName\s+["']([^"']+)["']/);
  const codeMatch = content.match(/versionCode\s+(\d+)/);

  if (!nameMatch) {
    throw new Error(`No versionName found in ${buildGradlePath}`);
  }
  if (!codeMatch) {
    throw new Error(`No versionCode found in ${buildGradlePath}`);
  }

  return {versionName: nameMatch[1], versionCode: codeMatch[1]};
}

/**
 * Read the applicationId literal from build.gradle. Fails when several
 * distinct literals are present (for example a flavor override), since the
 * effective id then depends on the build variant.
 */
export function getAndroidAppId(projectRoot: string, explicitGradlePath?: string): string {
  const {buildGradlePath, content} = readBuildGradle(projectRoot, explicitGradlePath);

  const ids = [...content.matchAll(/\bapplicationId\s+["']([^"']+)["']/g)].map(([, id]) => id);
  const distinct = [...new Set(ids)];

  if (distinct.length === 0) {
    throw new Error(`No applicationId found in ${buildGradlePath}`);
  }
  if (distinct.length > 1) {
    const values = distinct.map((id) => `"${id}"`).join(', ');
    throw new Error(
      `Multiple applicationId values found in ${buildGradlePath}: ${values}.\n` +
      `The effective id depends on the build variant, which cannot be resolved from the file.`
    );
  }

  return distinct[0];
}

/**
 * Update Android build.gradle with new version name and version code
 */
export function updateAndroidVersion(
  projectRoot: string,
  versionName: string,
  versionCode: number,
  verbose: boolean,
  explicitGradlePath?: string
): void {
  if (explicitGradlePath && !fs.existsSync(explicitGradlePath)) {
    throw new Error(`build.gradle not found at specified path: ${explicitGradlePath}`);
  }

  const buildGradlePath = explicitGradlePath ?? findBuildGradle(projectRoot);

  if (!buildGradlePath) {
    if (verbose) console.log('Skipping Android: build.gradle not found');
    return;
  }

  let content = fs.readFileSync(buildGradlePath, 'utf8');
  let modified = false;

  // Update versionName
  const versionNameRegex = /(versionName\s+["'])([^"']*)(['"])/;
  if (versionNameRegex.test(content)) {
    const newContent = content.replace(versionNameRegex, `$1${versionName}$3`);
    if (newContent !== content) {
      content = newContent;
      modified = true;
      if (verbose) console.log(`Updated versionName to ${versionName}`);
    }
  }

  // Update versionCode with calculated value
  const versionCodeRegex = /(versionCode\s+)(\d+)/;
  if (versionCodeRegex.test(content)) {
    const newContent = content.replace(versionCodeRegex, `$1${versionCode}`);
    if (newContent !== content) {
      content = newContent;
      modified = true;
      if (verbose) console.log(`Updated versionCode to ${versionCode}`);
    }
  }

  if (modified) {
    fs.writeFileSync(buildGradlePath, content, 'utf8');
    if (verbose) console.log(`Updated ${buildGradlePath}`);
  }
}
