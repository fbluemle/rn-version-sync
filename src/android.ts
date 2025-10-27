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

/**
 * Update Android build.gradle with new version name and version code
 */
export function updateAndroidVersion(
  projectRoot: string,
  versionName: string,
  versionCode: number,
  verbose: boolean
): void {
  const buildGradlePath = findBuildGradle(projectRoot);

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
