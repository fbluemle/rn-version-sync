import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Locate project.pbxproj: the explicit path when given (which must exist),
 * otherwise the first ios/<Project>.xcodeproj/project.pbxproj if present.
 */
function locatePbxproj(
  projectRoot: string,
  explicitPbxprojPath?: string,
): string | null {
  if (explicitPbxprojPath) {
    if (!fs.existsSync(explicitPbxprojPath)) {
      throw new Error(
        `project.pbxproj not found at specified path: ${explicitPbxprojPath}`,
      );
    }
    return explicitPbxprojPath;
  }

  const iosDir = path.join(projectRoot, 'ios');
  if (!fs.existsSync(iosDir)) {
    return null;
  }

  for (const entry of fs.readdirSync(iosDir, { withFileTypes: true })) {
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
  const pbxprojPath = locatePbxproj(projectRoot, explicitPbxprojPath);

  if (!pbxprojPath) {
    throw new Error('Could not find iOS project.pbxproj');
  }

  return { pbxprojPath, content: fs.readFileSync(pbxprojPath, 'utf8') };
}

function unquote(value: string): string {
  return value.trim().replace(/^"(.*)"$/, '$1');
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

interface BuildConfiguration {
  name: string;
  block: string;
}

/**
 * Build configurations of the XCConfigurationList with the given id.
 */
function getConfigurations(
  content: string,
  listId: string,
  pbxprojPath: string,
): BuildConfiguration[] {
  const listBlock = getObject(content, listId, pbxprojPath);
  const arrayMatch = listBlock.match(/buildConfigurations = \(([\s\S]*?)\);/);
  return [
    ...(arrayMatch?.[1] ?? '').matchAll(/^[ \t]*(\S+?)(?: \/\*.*?\*\/)?,$/gm),
  ].map(([, id]) => {
    const block = getObject(content, id, pbxprojPath);
    return { name: getEntry(block, 'name') ?? id, block };
  });
}

/**
 * The single application target of the project and the id of its build
 * configuration list.
 */
function getApplicationTarget(
  content: string,
  pbxprojPath: string,
): { name: string; configListId: string } {
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

  return { name: target.name, configListId: target.configListId };
}

/**
 * Id of the PBXProject object's build configuration list, if present.
 */
function getProjectConfigListId(content: string): string | undefined {
  const match = content.match(
    /^\t\t\S+?(?: \/\*.*?\*\/)? = \{\n\t\t\tisa = PBXProject;\n([\s\S]*?)^\t\t};/m,
  );
  return match ? getEntry(match[1], 'buildConfigurationList') : undefined;
}

interface AppConfiguration {
  target: string;
  configuration: string;
  pbxprojPath: string;
  /** Build setting value, or undefined when not set in project.pbxproj */
  get(key: string): string | undefined;
}

/**
 * Build settings of the application target's configuration with the given
 * name. The configuration is located through the target's configuration
 * list, not by position in the file, so test and extension targets do not
 * interfere. Like Xcode, a setting missing from the target's configuration
 * falls back to the project configuration of the same name; xcconfig files
 * are not read.
 */
function readAppConfiguration(
  projectRoot: string,
  explicitPbxprojPath: string | undefined,
  configuration: string,
): AppConfiguration {
  const { pbxprojPath, content } = readPbxproj(
    projectRoot,
    explicitPbxprojPath,
  );
  const target = getApplicationTarget(content, pbxprojPath);

  const targetConfigs = getConfigurations(
    content,
    target.configListId,
    pbxprojPath,
  );
  const targetConfig = targetConfigs.find((c) => c.name === configuration);
  if (!targetConfig) {
    const names = targetConfigs.map((c) => `"${c.name}"`).join(', ');
    throw new Error(
      `Build configuration "${configuration}" not found for target "${target.name}" in ${pbxprojPath}` +
        (names ? ` (available: ${names})` : ''),
    );
  }

  const projectListId = getProjectConfigListId(content);
  const projectConfig = projectListId
    ? getConfigurations(content, projectListId, pbxprojPath).find(
        (c) => c.name === configuration,
      )
    : undefined;

  return {
    target: target.name,
    configuration,
    pbxprojPath,
    get: (key) =>
      getEntry(targetConfig.block, key) ??
      (projectConfig ? getEntry(projectConfig.block, key) : undefined),
  };
}

/**
 * Value of a build setting that must be present and literal.
 */
function requireSetting(config: AppConfiguration, key: string): string {
  const value = config.get(key);
  const where = `build configuration "${config.configuration}" of target "${config.target}"`;

  if (value === undefined) {
    throw new Error(
      `No ${key} in ${where} in ${config.pbxprojPath}.\n` +
        `Only settings in project.pbxproj are read; xcconfig files are not resolved.`,
    );
  }
  if (/\$[({]/.test(value)) {
    throw new Error(
      `${key} "${value}" in ${where} references a build setting variable and cannot be resolved from ${config.pbxprojPath}`,
    );
  }

  return value;
}

/**
 * Read MARKETING_VERSION (version name) and CURRENT_PROJECT_VERSION (version
 * code) of the application target's build configuration with the given
 * name, as written.
 */
export function getIOSVersions(
  projectRoot: string,
  explicitPbxprojPath?: string,
  configuration = 'Release',
): { versionName: string; versionCode: string } {
  const config = readAppConfiguration(
    projectRoot,
    explicitPbxprojPath,
    configuration,
  );
  return {
    versionName: requireSetting(config, 'MARKETING_VERSION'),
    versionCode: requireSetting(config, 'CURRENT_PROJECT_VERSION'),
  };
}

/**
 * Read PRODUCT_BUNDLE_IDENTIFIER of the application target's build
 * configuration with the given name.
 */
export function getIOSAppId(
  projectRoot: string,
  explicitPbxprojPath?: string,
  configuration = 'Release',
): string {
  const config = readAppConfiguration(
    projectRoot,
    explicitPbxprojPath,
    configuration,
  );
  return requireSetting(config, 'PRODUCT_BUNDLE_IDENTIFIER');
}

/**
 * Update iOS project.pbxproj with new version name and version code. Every
 * MARKETING_VERSION and CURRENT_PROJECT_VERSION in the file is replaced, so
 * app, test and extension targets stay in step as Xcode requires.
 * Returns the path of the file, or null when no project.pbxproj was found.
 * Throws when the file has neither setting.
 */
export function updateIOSVersion(
  projectRoot: string,
  versionName: string,
  versionCode: string,
  verbose: boolean,
  explicitPbxprojPath?: string,
): string | null {
  const pbxprojPath = locatePbxproj(projectRoot, explicitPbxprojPath);

  if (!pbxprojPath) {
    return null;
  }

  let content = fs.readFileSync(pbxprojPath, 'utf8');
  let modified = false;

  // Update MARKETING_VERSION (corresponds to CFBundleShortVersionString - version name)
  const marketingVersionRegex = /(MARKETING_VERSION\s*=\s*)([^;]+)(;)/g;
  if (!marketingVersionRegex.test(content)) {
    throw new Error(`No MARKETING_VERSION found in ${pbxprojPath}`);
  }
  const withVersionName = content.replace(
    marketingVersionRegex,
    `$1${versionName}$3`,
  );
  if (withVersionName !== content) {
    content = withVersionName;
    modified = true;
    if (verbose) console.log(`Updated MARKETING_VERSION to ${versionName}`);
  }

  // Update CURRENT_PROJECT_VERSION (corresponds to CFBundleVersion - version code)
  const currentProjectVersionRegex =
    /(CURRENT_PROJECT_VERSION\s*=\s*)([^;]+)(;)/g;
  if (!currentProjectVersionRegex.test(content)) {
    throw new Error(`No CURRENT_PROJECT_VERSION found in ${pbxprojPath}`);
  }
  const withVersionCode = content.replace(
    currentProjectVersionRegex,
    `$1${versionCode}$3`,
  );
  if (withVersionCode !== content) {
    content = withVersionCode;
    modified = true;
    if (verbose)
      console.log(`Updated CURRENT_PROJECT_VERSION to ${versionCode}`);
  }

  if (modified) {
    fs.writeFileSync(pbxprojPath, content, 'utf8');
    if (verbose) console.log(`Updated ${pbxprojPath}`);
  }

  return pbxprojPath;
}
