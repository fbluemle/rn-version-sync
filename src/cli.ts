#!/usr/bin/env node

import {program} from 'commander';
import {syncVersions, resolveVersions} from '.';
import * as fs from 'fs';
import * as path from 'path';

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);

program
  .name('rn-version-sync')
  .description('Sync React Native version with native code')
  .version(packageJson.version)
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--version-name <name>', 'Override version name (default: from package.json)')
  .option(
    '--version-code <code>',
    'Override version code (default: calculated from semver as 10000*major + 100*minor + patch)'
  )
  .option('--project-dir <dir>', 'Project root directory (default: current directory)')
  .option('--gradle-path <path>', 'Path to Android build.gradle')
  .option('--pbxproj-path <path>', 'Path to iOS project.pbxproj')
  .option('--reserve-builds <n>', 'Reserve N build slots per version (e.g. 100 turns 10203 into 1020300)')
  .option('--skip-android', 'Skip Android version update')
  .option('--skip-ios', 'Skip iOS version update')
  .option('--dry-run', 'Print resolved version name and code without writing files')
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

      if (reserveBuilds !== undefined && (isNaN(reserveBuilds) || reserveBuilds < 1)) {
        throw new Error('reserve-builds must be a positive integer');
      }

      const syncOptions = {
        verbose: options.verbose,
        versionName: options.versionName,
        versionCode,
        reserveBuilds,
        gradlePath: options.gradlePath ? path.resolve(options.gradlePath) : undefined,
        pbxprojPath: options.pbxprojPath ? path.resolve(options.pbxprojPath) : undefined,
        skipAndroid: options.skipAndroid,
        skipIos: options.skipIos,
      };

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
