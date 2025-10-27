#!/usr/bin/env node

import {program} from 'commander';
import {syncVersions} from '.';
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
  .option(
    '--version-code <code>',
    'Override version code (default: calculated from semver as 10000*major + 100*minor + patch)'
  )
  .action((options) => {
    try {
      const versionCode = options.versionCode
        ? parseInt(options.versionCode, 10)
        : undefined;

      if (versionCode !== undefined && isNaN(versionCode)) {
        throw new Error('version-code must be a valid number');
      }

      syncVersions(process.cwd(), {
        verbose: options.verbose,
        versionCode,
      });
      console.log('✓ Version sync completed successfully');
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program.parse();
