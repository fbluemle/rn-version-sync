import * as fs from 'fs';
import * as path from 'path';

/**
 * Find project.pbxproj file in iOS directory
 */
function findPbxproj(projectRoot: string): string | null {
  const iosDir = path.join(projectRoot, 'ios');
  if (!fs.existsSync(iosDir)) {
    return null;
  }

  // Look for .xcodeproj directories
  const entries = fs.readdirSync(iosDir, {withFileTypes: true});
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith('.xcodeproj')) {
      const pbxprojPath = path.join(iosDir, entry.name, 'project.pbxproj');
      if (fs.existsSync(pbxprojPath)) {
        return pbxprojPath;
      }
    }
  }

  return null;
}

function readPbxproj(projectRoot: string, explicitPbxprojPath?: string): {
  pbxprojPath: string;
  content: string;
} {
  if (explicitPbxprojPath && !fs.existsSync(explicitPbxprojPath)) {
    throw new Error(`project.pbxproj not found at specified path: ${explicitPbxprojPath}`);
  }

  const pbxprojPath = explicitPbxprojPath ?? findPbxproj(projectRoot);

  if (!pbxprojPath) {
    throw new Error('Could not find iOS project.pbxproj');
  }

  return {pbxprojPath, content: fs.readFileSync(pbxprojPath, 'utf8')};
}

/**
 * Read MARKETING_VERSION (version name) and CURRENT_PROJECT_VERSION (version code)
 * from project.pbxproj as written. Returns the first match for each.
 */
export function getIOSVersions(
  projectRoot: string,
  explicitPbxprojPath?: string
): {versionName: string; versionCode: string} {
  const {pbxprojPath, content} = readPbxproj(projectRoot, explicitPbxprojPath);

  const nameMatch = content.match(/MARKETING_VERSION\s*=\s*([^;]+);/);
  const codeMatch = content.match(/CURRENT_PROJECT_VERSION\s*=\s*([^;]+);/);

  if (!nameMatch) {
    throw new Error(`No MARKETING_VERSION found in ${pbxprojPath}`);
  }
  if (!codeMatch) {
    throw new Error(`No CURRENT_PROJECT_VERSION found in ${pbxprojPath}`);
  }

  return {
    versionName: nameMatch[1].trim().replace(/^"(.*)"$/, '$1'),
    versionCode: codeMatch[1].trim().replace(/^"(.*)"$/, '$1'),
  };
}

/**
 * Update iOS project.pbxproj with new version name and version code
 */
export function updateIOSVersion(
  projectRoot: string,
  versionName: string,
  versionCode: string,
  verbose: boolean,
  explicitPbxprojPath?: string
): void {
  if (explicitPbxprojPath && !fs.existsSync(explicitPbxprojPath)) {
    throw new Error(`project.pbxproj not found at specified path: ${explicitPbxprojPath}`);
  }

  const pbxprojPath = explicitPbxprojPath ?? findPbxproj(projectRoot);

  if (!pbxprojPath) {
    if (verbose) console.log('Skipping iOS: project.pbxproj not found');
    return;
  }

  let content = fs.readFileSync(pbxprojPath, 'utf8');
  let modified = false;

  // Update MARKETING_VERSION (corresponds to CFBundleShortVersionString - version name)
  const marketingVersionRegex = /(MARKETING_VERSION\s*=\s*)([^;]+)(;)/g;
  if (marketingVersionRegex.test(content)) {
    const newContent = content.replace(marketingVersionRegex, `$1${versionName}$3`);
    if (newContent !== content) {
      content = newContent;
      modified = true;
      if (verbose) console.log(`Updated MARKETING_VERSION to ${versionName}`);
    }
  }

  // Update CURRENT_PROJECT_VERSION (corresponds to CFBundleVersion - version code)
  const currentProjectVersionRegex = /(CURRENT_PROJECT_VERSION\s*=\s*)([^;]+)(;)/g;
  if (currentProjectVersionRegex.test(content)) {
    const newContent = content.replace(currentProjectVersionRegex, `$1${versionCode}$3`);
    if (newContent !== content) {
      content = newContent;
      modified = true;
      if (verbose) console.log(`Updated CURRENT_PROJECT_VERSION to ${versionCode}`);
    }
  }

  if (modified) {
    fs.writeFileSync(pbxprojPath, content, 'utf8');
    if (verbose) console.log(`Updated ${pbxprojPath}`);
  }
}
