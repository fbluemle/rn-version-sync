import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface GradleConfig {
  versionName?: string;
  versionCode?: number;
  quote?: '"' | "'";
}

export interface PbxprojBuildConfig {
  name: string;
  version?: string;
  buildNumber?: string;
}

export interface ProjectOptions {
  version?: string;
  android?: GradleConfig | false;
  ios?: PbxprojBuildConfig[] | false;
}

const defaults = {
  version: '1.0.0',
  android: {versionName: '1.0.0', versionCode: 1, quote: '"' as const},
  ios: [
    {name: 'Debug', version: '1.0.0', buildNumber: '1'},
    {name: 'Release', version: '1.0.0', buildNumber: '1'},
  ],
};

export class TestProject {
  readonly root: string;

  constructor(options: ProjectOptions = {}) {
    this.root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-version-sync-'));

    fs.writeFileSync(
      path.join(this.root, 'package.json'),
      JSON.stringify({name: 'test-app', version: options.version ?? defaults.version}, null, 2)
    );

    if (options.android !== false) {
      const cfg = {...defaults.android, ...options.android};
      const androidDir = path.join(this.root, 'android', 'app');
      fs.mkdirSync(androidDir, {recursive: true});
      fs.writeFileSync(
        path.join(androidDir, 'build.gradle'),
        buildGradle(cfg)
      );
    }

    if (options.ios !== false) {
      const configs = options.ios ?? defaults.ios;
      const xcodeprojDir = path.join(this.root, 'ios', 'TestApp.xcodeproj');
      fs.mkdirSync(xcodeprojDir, {recursive: true});
      fs.writeFileSync(
        path.join(xcodeprojDir, 'project.pbxproj'),
        buildPbxproj(configs)
      );
    }
  }

  gradlePath(): string {
    return path.join(this.root, 'android', 'app', 'build.gradle');
  }

  pbxprojPath(): string {
    const iosDir = path.join(this.root, 'ios');
    const entries = fs.readdirSync(iosDir, {withFileTypes: true});
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
    fs.rmSync(this.root, {recursive: true, force: true});
  }
}

export function buildGradle(cfg: GradleConfig = {}): string {
  const q = cfg.quote ?? '"';
  const name = cfg.versionName ?? '1.0.0';
  const code = cfg.versionCode ?? 1;
  return [
    'android {',
    '    defaultConfig {',
    `        applicationId ${q}com.testapp${q}`,
    `        versionCode ${code}`,
    `        versionName ${q}${name}${q}`,
    '    }',
    '}',
  ].join('\n');
}

export function buildPbxproj(configs: PbxprojBuildConfig[]): string {
  const sections = configs.map(
    (c) => `\t\t00000000 /* ${c.name} */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tCURRENT_PROJECT_VERSION = ${c.buildNumber ?? '1'};
\t\t\t\tMARKETING_VERSION = ${c.version ?? '1.0.0'};
\t\t\t};
\t\t\tname = ${c.name};
\t\t};`
  );

  return `// !$*UTF8*$!
{
\tarchiveVersion = 1;
\tobjects = {
\t\t/* Begin XCBuildConfiguration section */
${sections.join('\n')}
\t\t/* End XCBuildConfiguration section */
\t};
}`;
}
