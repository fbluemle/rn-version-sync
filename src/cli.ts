#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { InvalidArgumentError, program } from 'commander';
import {
  formatEnv,
  formatTemplate,
  readNativeValues,
  resolveVersions,
  syncVersions,
} from '.';

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
);

// Read-only flags that print to stdout, keyed by commander's option name.
// Single-value flags render a fixed template; --print renders --format.
const printFlags: Record<string, { flag: string; template?: string }> = {
  printVersionName: {
    flag: '--print-version-name',
    template: '{versionName}',
  },
  printVersionCode: {
    flag: '--print-version-code',
    template: '{versionCode}',
  },
  printAppId: { flag: '--print-app-id', template: '{appId}' },
  printEnv: { flag: '--print-env' },
  print: { flag: '--print' },
};

// Output of --print without --format, in the style of --dry-run
const DEFAULT_TEMPLATE =
  'appId: {appId}\nversionName: {versionName}\nversionCode: {versionCode}';

function parseInteger(value: string): number {
  if (!/^-?\d+$/.test(value)) {
    throw new InvalidArgumentError('Not an integer.');
  }
  return Number(value);
}

program
  .name('rn-version-sync')
  .description('Sync React Native version with native code')
  .version(packageJson.version)
  .option('-v, --verbose', 'Enable verbose logging')
  .option(
    '--version-name <name>',
    'Override version name (default: from package.json)',
  )
  .option(
    '--version-code <code>',
    'Override version code (default: calculated from semver as 10000*major + 100*minor + patch)',
    parseInteger,
  )
  .option(
    '--project-dir <dir>',
    'Project root directory (default: current directory)',
  )
  .option('--gradle-path <path>', 'Path to Android build.gradle')
  .option('--pbxproj-path <path>', 'Path to iOS project.pbxproj')
  .option(
    '--reserve-builds <n>',
    'Reserve N build slots per version (e.g. 100 turns 10203 into 1020300)',
    parseInteger,
  )
  .option('--skip-android', 'Skip Android version update')
  .option('--skip-ios', 'Skip iOS version update')
  .option(
    '--dry-run',
    'Print resolved version name and code without writing files',
  )
  .option(
    '--print-version-name <platform>',
    'Print version name (Android versionName / iOS MARKETING_VERSION) read from the native file for "android" or "ios"',
  )
  .option(
    '--print-version-code <platform>',
    'Print version code (Android versionCode / iOS CURRENT_PROJECT_VERSION) read from the native file for "android" or "ios"',
  )
  .option(
    '--print-app-id <platform>',
    'Print app identifier (Android applicationId / iOS PRODUCT_BUNDLE_IDENTIFIER) read from the native file for "android" or "ios"',
  )
  .option(
    '--print-env <platform>',
    'Print APP_ID, VERSION_NAME and VERSION_CODE as dotenv lines read from the native file for "android" or "ios"',
  )
  .option(
    '--print <platform>',
    'Print app id, version name and version code read from the native file for "android" or "ios", one per line or as the --format template',
  )
  .option(
    '--format <template>',
    'Template for --print with {appId}, {versionName} and {versionCode} placeholders, e.g. "{appId}@{versionName}+{versionCode}"',
  )
  .option(
    '--configuration <name>',
    'Xcode build configuration for the iOS app id with --print-app-id, --print-env or --print (default: Release)',
  )
  .action((options) => {
    try {
      const projectDir = options.projectDir
        ? path.resolve(options.projectDir)
        : process.cwd();

      const syncOptions = {
        verbose: options.verbose,
        versionName: options.versionName,
        versionCode: options.versionCode,
        reserveBuilds: options.reserveBuilds,
        gradlePath: options.gradlePath
          ? path.resolve(options.gradlePath)
          : undefined,
        pbxprojPath: options.pbxprojPath
          ? path.resolve(options.pbxprojPath)
          : undefined,
        skipAndroid: options.skipAndroid,
        skipIos: options.skipIos,
      };

      const activePrints = Object.keys(printFlags).filter(
        (key) => options[key] !== undefined,
      );

      const modes = activePrints.map((key) => printFlags[key].flag);
      if (options.dryRun) {
        modes.push('--dry-run');
      }
      if (modes.length > 1) {
        throw new Error(
          `Only one of ${modes.join(', ')} may be used at a time`,
        );
      }

      if (options.format !== undefined && options.print === undefined) {
        throw new Error('--format can only be used with --print');
      }

      const withAppId = [options.printAppId, options.printEnv, options.print];
      if (options.configuration !== undefined && !withAppId.includes('ios')) {
        throw new Error(
          '--configuration can only be used with --print-app-id, --print-env or --print for ios',
        );
      }

      if (activePrints.length === 1) {
        const [key] = activePrints;
        const platform: string = options[key];
        if (platform !== 'android' && platform !== 'ios') {
          throw new Error(`${printFlags[key].flag} must be "android" or "ios"`);
        }

        const readOptions = {
          gradlePath: syncOptions.gradlePath,
          pbxprojPath: syncOptions.pbxprojPath,
          configuration: options.configuration,
        };

        if (key === 'printEnv') {
          const values = readNativeValues(projectDir, platform, readOptions);
          process.stdout.write(formatEnv(values));
          return;
        }

        const template =
          printFlags[key].template ?? options.format ?? DEFAULT_TEMPLATE;
        const output = formatTemplate(
          template,
          projectDir,
          platform,
          readOptions,
        );
        process.stdout.write(`${output}\n`);
        return;
      }

      if (options.dryRun) {
        const resolved = resolveVersions(projectDir, syncOptions);
        console.log(`versionName: ${resolved.versionName}`);
        console.log(`versionCode: ${resolved.versionCode}`);
        return;
      }

      syncVersions(projectDir, syncOptions);
      console.log('✓ Version sync completed successfully');
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program.parse();
