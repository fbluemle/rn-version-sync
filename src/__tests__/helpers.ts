import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface GradleConfig {
  versionName?: string;
  versionCode?: number;
  quote?: '"' | "'";
  applicationId?: string;
  namespace?: string;
  /** applicationId literals declared inside productFlavors */
  flavorApplicationIds?: string[];
}

export interface PbxprojBuildConfig {
  name: string;
  version?: string;
  buildNumber?: string;
  /** Written verbatim as PRODUCT_BUNDLE_IDENTIFIER; omitted when undefined */
  bundleId?: string;
}

export interface PbxprojTarget {
  name: string;
  productType?: string;
  configs: PbxprojBuildConfig[];
}

export interface ProjectOptions {
  version?: string;
  android?: GradleConfig | false;
  /** Build configurations of a single application target named TestApp */
  ios?: PbxprojBuildConfig[] | false;
  /** Full target layout; takes precedence over `ios` */
  iosTargets?: PbxprojTarget[];
}

export const APPLICATION_PRODUCT_TYPE = 'com.apple.product-type.application';
export const UNIT_TEST_PRODUCT_TYPE = 'com.apple.product-type.bundle.unit-test';

const defaults = {
  version: '1.0.0',
  android: { versionName: '1.0.0', versionCode: 1, quote: '"' as const },
  ios: [
    { name: 'Debug', version: '1.0.0', buildNumber: '1' },
    { name: 'Release', version: '1.0.0', buildNumber: '1' },
  ],
};

export class TestProject {
  readonly root: string;

  constructor(options: ProjectOptions = {}) {
    this.root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-version-sync-'));

    fs.writeFileSync(
      path.join(this.root, 'package.json'),
      JSON.stringify(
        { name: 'test-app', version: options.version ?? defaults.version },
        null,
        2,
      ),
    );

    if (options.android !== false) {
      const cfg = { ...defaults.android, ...options.android };
      const androidDir = path.join(this.root, 'android', 'app');
      fs.mkdirSync(androidDir, { recursive: true });
      fs.writeFileSync(path.join(androidDir, 'build.gradle'), buildGradle(cfg));
    }

    const targets =
      options.iosTargets ??
      (options.ios === false
        ? undefined
        : [{ name: 'TestApp', configs: options.ios ?? defaults.ios }]);

    if (targets !== undefined) {
      const xcodeprojDir = path.join(this.root, 'ios', 'TestApp.xcodeproj');
      fs.mkdirSync(xcodeprojDir, { recursive: true });
      fs.writeFileSync(
        path.join(xcodeprojDir, 'project.pbxproj'),
        buildPbxproj(targets),
      );
    }
  }

  gradlePath(): string {
    return path.join(this.root, 'android', 'app', 'build.gradle');
  }

  pbxprojPath(): string {
    const iosDir = path.join(this.root, 'ios');
    const entries = fs.readdirSync(iosDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.endsWith('.xcodeproj')) {
        return path.join(iosDir, entry.name, 'project.pbxproj');
      }
    }
    throw new Error('No .xcodeproj found in test project');
  }

  readGradle(): string {
    return fs.readFileSync(this.gradlePath(), 'utf8');
  }

  readPbxproj(): string {
    return fs.readFileSync(this.pbxprojPath(), 'utf8');
  }

  cleanup(): void {
    fs.rmSync(this.root, { recursive: true, force: true });
  }
}

export function buildGradle(cfg: GradleConfig = {}): string {
  const q = cfg.quote ?? '"';
  const name = cfg.versionName ?? '1.0.0';
  const code = cfg.versionCode ?? 1;
  const appId = cfg.applicationId ?? 'com.testapp';
  const flavors = (cfg.flavorApplicationIds ?? []).flatMap((id, i) => [
    `        flavor${i} {`,
    `            applicationId ${q}${id}${q}`,
    '        }',
  ]);
  return [
    'android {',
    `    namespace ${q}${cfg.namespace ?? appId}${q}`,
    '    defaultConfig {',
    `        applicationId ${q}${appId}${q}`,
    `        versionCode ${code}`,
    `        versionName ${q}${name}${q}`,
    '    }',
    '    buildTypes {',
    '        debug {',
    `            applicationIdSuffix ${q}.debug${q}`,
    '        }',
    '        release {',
    '        }',
    '    }',
    ...(flavors.length ? ['    productFlavors {', ...flavors, '    }'] : []),
    '}',
  ].join('\n');
}

/**
 * Emit the pbxproj sections the tool reads, laid out like Xcode writes them.
 * Objects appear in the order of the given targets, so a target listed first
 * has its build configurations sorted before the application target's.
 */
export function buildPbxproj(targets: PbxprojTarget[]): string {
  let counter = 0;
  const nextId = () => (++counter).toString(16).toUpperCase().padStart(24, '0');

  const targetSections: string[] = [];
  const configSections: string[] = [];
  const listSections: string[] = [];

  for (const target of targets) {
    const targetId = nextId();
    const listId = nextId();
    const configs = target.configs.map((config) => ({ config, id: nextId() }));
    const listComment = `/* Build configuration list for PBXNativeTarget "${target.name}" */`;

    targetSections.push(`\t\t${targetId} /* ${target.name} */ = {
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = ${listId} ${listComment};
\t\t\tbuildPhases = (
\t\t\t);
\t\t\tname = ${target.name};
\t\t\tproductName = ${target.name};
\t\t\tproductType = "${target.productType ?? APPLICATION_PRODUCT_TYPE}";
\t\t};`);

    for (const { config, id } of configs) {
      const settings = [
        `\t\t\t\tCURRENT_PROJECT_VERSION = ${config.buildNumber ?? '1'};`,
        `\t\t\t\tMARKETING_VERSION = ${config.version ?? '1.0.0'};`,
        ...(config.bundleId !== undefined
          ? [`\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = ${config.bundleId};`]
          : []),
        '\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";',
      ];
      configSections.push(`\t\t${id} /* ${config.name} */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
${settings.join('\n')}
\t\t\t};
\t\t\tname = ${config.name};
\t\t};`);
    }

    listSections.push(`\t\t${listId} ${listComment} = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
${configs.map(({ config, id }) => `\t\t\t\t${id} /* ${config.name} */,`).join('\n')}
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};`);
  }

  return `// !$*UTF8*$!
{
\tarchiveVersion = 1;
\tobjects = {

/* Begin PBXNativeTarget section */
${targetSections.join('\n')}
/* End PBXNativeTarget section */

/* Begin XCBuildConfiguration section */
${configSections.join('\n')}
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
${listSections.join('\n')}
/* End XCConfigurationList section */
\t};
}`;
}
