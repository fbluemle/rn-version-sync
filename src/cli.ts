#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
  getAndroidAppId,
  getAndroidVersions,
  getIOSAppId,
  getIOSVersions,
  resolveVersions,
  syncVersions,
} from '.';

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
);

// Read-only flags that print a single value to stdout; keyed by commander's option name
const printFlags: Record<string, string> = {
  printVersionName: '--print-version-name',
  printVersionCode: '--print-version-code',
  printAppId: '--print-app-id',
};

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
    '--configuration <name>',
    'Xcode build configuration to read with --print-app-id ios (default: Release)',
  )
  .action((options) => {
    try {
      const projectDir = options.projectDir
        ? path.resolve(options.projectDir)
        : process.cwd();

      const versionCode = options.versionCode
        ? parseInt(options.versionCode, 10)
        : undefined;

      if (versionCode !== undefined && isNaN(versionCode)) {
        throw new Error('version-code must be a valid number');
      }

      const reserveBuilds = options.reserveBuilds
        ? parseInt(options.reserveBuilds, 10)
        : undefined;

      if (
        reserveBuilds !== undefined &&
        (isNaN(reserveBuilds) || reserveBuilds < 1)
      ) {
        throw new Error('reserve-builds must be a positive integer');
      }

      const syncOptions = {
        verbose: options.verbose,
        versionName: options.versionName,
        versionCode,
        reserveBuilds,
        gradlePath: options.gradlePath
          ? path.resolve(options.gradlePath)
          : undefined,
        pbxprojPath: options.pbxprojPath
          ? path.resolve(options.pbxprojPath)
          : undefined,
        skipAndroid: options.skipAndroid,
        skipIos: options.skipIos,
      };

      if (options.configuration !== undefined && options.printAppId !== 'ios') {
        throw new Error(
          '--configuration can only be used with --print-app-id ios',
        );
      }

      const activePrints = Object.keys(printFlags).filter(
        (key) => options[key] !== undefined,
      );

      if (activePrints.length > 1) {
        throw new Error(
          `Only one of ${Object.values(printFlags).join(', ')} may be used at a time`,
        );
      }

      if (activePrints.length === 1) {
        const [key] = activePrints;
        const platform: string = options[key];
        if (platform !== 'android' && platform !== 'ios') {
          throw new Error(`${printFlags[key]} must be "android" or "ios"`);
        }

        let value: string;
        if (key === 'printAppId') {
          value =
            platform === 'android'
              ? getAndroidAppId(projectDir, syncOptions.gradlePath)
              : getIOSAppId(
                  projectDir,
                  syncOptions.pbxprojPath,
                  options.configuration,
                );
        } else {
          const versions =
            platform === 'android'
              ? getAndroidVersions(projectDir, syncOptions.gradlePath)
              : getIOSVersions(projectDir, syncOptions.pbxprojPath);
          value =
            key === 'printVersionName'
              ? versions.versionName
              : versions.versionCode;
        }
        process.stdout.write(`${value}\n`);
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
