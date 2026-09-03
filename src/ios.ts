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
  const entries = fs.readdirSync(iosDir, { withFileTypes: true });
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

function readPbxproj(
  projectRoot: string,
  explicitPbxprojPath?: string,
): {
  pbxprojPath: string;
  content: string;
} {
  if (explicitPbxprojPath && !fs.existsSync(explicitPbxprojPath)) {
    throw new Error(
      `project.pbxproj not found at specified path: ${explicitPbxprojPath}`,
    );
  }

  const pbxprojPath = explicitPbxprojPath ?? findPbxproj(projectRoot);

  if (!pbxprojPath) {
    throw new Error('Could not find iOS project.pbxproj');
  }

  return { pbxprojPath, content: fs.readFileSync(pbxprojPath, 'utf8') };
}

function unquote(value: string): string {
  return value.trim().replace(/^"(.*)"$/, '$1');
}

/**
 * Read MARKETING_VERSION (version name) and CURRENT_PROJECT_VERSION (version code)
 * from project.pbxproj as written. Returns the first match for each.
 */
export function getIOSVersions(
  projectRoot: string,
  explicitPbxprojPath?: string,
): { versionName: string; versionCode: string } {
  const { pbxprojPath, content } = readPbxproj(
    projectRoot,
    explicitPbxprojPath,
  );

  const nameMatch = content.match(/MARKETING_VERSION\s*=\s*([^;]+);/);
  const codeMatch = content.match(/CURRENT_PROJECT_VERSION\s*=\s*([^;]+);/);

  if (!nameMatch) {
    throw new Error(`No MARKETING_VERSION found in ${pbxprojPath}`);
  }
  if (!codeMatch) {
    throw new Error(`No CURRENT_PROJECT_VERSION found in ${pbxprojPath}`);
  }

  return {
    versionName: unquote(nameMatch[1]),
    versionCode: unquote(codeMatch[1]),
  };
}

const APPLICATION_PRODUCT_TYPE = 'com.apple.product-type.application';

/**
 * Body of the top-level object with the given id. Relies on Xcode's
 * formatting: objects are indented by two tabs and close with `};` at the
 * same depth.
 */
function getObject(content: string, id: string, pbxprojPath: string): string {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(
    new RegExp(
      `^\\t\\t${escapedId}(?: /\\*.*?\\*/)? = \\{\\n([\\s\\S]*?)^\\t\\t};`,
      'm',
    ),
  );

  if (!match) {
    throw new Error(`Could not find object ${id} in ${pbxprojPath}`);
  }

  return match[1];
}

/**
 * Value of a `key = value;` entry in an object body, unquoted and without
 * the trailing comment.
 */
function getEntry(block: string, key: string): string | undefined {
  const match = block.match(
    new RegExp(`^[ \\t]*${key} = ([^;]+?)(?: /\\*.*?\\*/)?;`, 'm'),
  );
  return match ? unquote(match[1]) : undefined;
}

/**
 * Read PRODUCT_BUNDLE_IDENTIFIER of the application target's build
 * configuration with the given name. The configuration is located through
 * the target's configuration list, not by position in the file, so test and
 * extension targets do not interfere.
 */
export function getIOSAppId(
  projectRoot: string,
  explicitPbxprojPath?: string,
  configuration = 'Release',
): string {
  const { pbxprojPath, content } = readPbxproj(
    projectRoot,
    explicitPbxprojPath,
  );

  const targetRegex =
    /^\t\t(\S+?)(?: \/\*.*?\*\/)? = \{\n\t\t\tisa = PBXNativeTarget;\n([\s\S]*?)^\t\t};/gm;
  const targets = [...content.matchAll(targetRegex)]
    .map(([, id, block]) => ({
      name: getEntry(block, 'name') ?? id,
      productType: getEntry(block, 'productType'),
      configListId: getEntry(block, 'buildConfigurationList'),
    }))
    .filter((target) => target.productType === APPLICATION_PRODUCT_TYPE);

  if (targets.length === 0) {
    throw new Error(`No application target found in ${pbxprojPath}`);
  }
  if (targets.length > 1) {
    const names = targets.map((target) => `"${target.name}"`).join(', ');
    throw new Error(
      `Multiple application targets found in ${pbxprojPath}: ${names}`,
    );
  }

  const target = targets[0];
  if (!target.configListId) {
    throw new Error(
      `Target "${target.name}" has no buildConfigurationList in ${pbxprojPath}`,
    );
  }

  const listBlock = getObject(content, target.configListId, pbxprojPath);
  const arrayMatch = listBlock.match(/buildConfigurations = \(([\s\S]*?)\);/);
  const configs = [
    ...(arrayMatch?.[1] ?? '').matchAll(/^[ \t]*(\S+?)(?: \/\*.*?\*\/)?,$/gm),
  ]
    .map(([, id]) => ({ id, block: getObject(content, id, pbxprojPath) }))
    .map((config) => ({
      ...config,
      name: getEntry(config.block, 'name') ?? config.id,
    }));

  const config = configs.find((c) => c.name === configuration);
  if (!config) {
    const names = configs.map((c) => `"${c.name}"`).join(', ');
    throw new Error(
      `Build configuration "${configuration}" not found for target "${target.name}" in ${pbxprojPath}` +
        (names ? ` (available: ${names})` : ''),
    );
  }

  const appId = getEntry(config.block, 'PRODUCT_BUNDLE_IDENTIFIER');
  if (appId === undefined) {
    throw new Error(
      `No PRODUCT_BUNDLE_IDENTIFIER in build configuration "${configuration}" of target "${target.name}" in ${pbxprojPath}.\n` +
        `Only settings in project.pbxproj are read; xcconfig files and project-level settings are not resolved.`,
    );
  }
  if (/\$[({]/.test(appId)) {
    throw new Error(
      `PRODUCT_BUNDLE_IDENTIFIER "${appId}" in build configuration "${configuration}" of target "${target.name}" ` +
        `references a build setting variable and cannot be resolved from ${pbxprojPath}`,
    );
  }

  return appId;
}

/**
 * Update iOS project.pbxproj with new version name and version code
 */
export function updateIOSVersion(
  projectRoot: string,
  versionName: string,
  versionCode: string,
  verbose: boolean,
  explicitPbxprojPath?: string,
): void {
  if (explicitPbxprojPath && !fs.existsSync(explicitPbxprojPath)) {
    throw new Error(
      `project.pbxproj not found at specified path: ${explicitPbxprojPath}`,
    );
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
    const newContent = content.replace(
      marketingVersionRegex,
      `$1${versionName}$3`,
    );
    if (newContent !== content) {
      content = newContent;
      modified = true;
      if (verbose) console.log(`Updated MARKETING_VERSION to ${versionName}`);
    }
  }

  // Update CURRENT_PROJECT_VERSION (corresponds to CFBundleVersion - version code)
  const currentProjectVersionRegex =
    /(CURRENT_PROJECT_VERSION\s*=\s*)([^;]+)(;)/g;
  if (currentProjectVersionRegex.test(content)) {
    const newContent = content.replace(
      currentProjectVersionRegex,
      `$1${versionCode}$3`,
    );
    if (newContent !== content) {
      content = newContent;
      modified = true;
      if (verbose)
        console.log(`Updated CURRENT_PROJECT_VERSION to ${versionCode}`);
    }
  }

  if (modified) {
    fs.writeFileSync(pbxprojPath, content, 'utf8');
    if (verbose) console.log(`Updated ${pbxprojPath}`);
  }
}
