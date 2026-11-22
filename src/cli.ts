#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { InvalidArgumentError, program } from 'commander';
import type { Platform, StoreCredentials, VersionStatus } from '.';
import {
  PLATFORMS,
  checkVersions,
  formatEnv,
  formatTemplate,
  getNextVersionCode,
  getStoreVersionCodes,
  loadConfig,
  readNativeValues,
  syncVersions,
} from '.';

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
);

// Read-only flags that take a platform and print to stdout, keyed by
// commander's option name. Single-value flags render a fixed template;
// --print renders --format.
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
  printStoreVersionCodes: { flag: '--print-store-version-codes' },
};

// Output of --print without --format
const DEFAULT_TEMPLATE =
  'appId: {appId}\nversionName: {versionName}\nversionCode: {versionCode}';

function parseInteger(value: string): number {
  if (!/^-?\d+$/.test(value)) {
    throw new InvalidArgumentError('Not an integer.');
  }
  return Number(value);
}

function collectIntegers(value: string, previous: number[] = []): number[] {
  return [...previous, parseInteger(value)];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Credentials of the stores of the given platforms, from the environment.
 */
function readStoreCredentials(platforms: Platform[]): StoreCredentials {
  const credentials: StoreCredentials = {};
  if (platforms.includes('android')) {
    credentials.android = requireEnv('PLAY_SERVICE_ACCOUNT_JSON');
  }
  if (platforms.includes('ios')) {
    credentials.ios = {
      keyId: requireEnv('ASC_KEY_ID'),
      issuerId: requireEnv('ASC_ISSUER_ID'),
      privateKey: requireEnv('ASC_PRIVATE_KEY'),
    };
  }
  return credentials;
}

/**
 * Render package.json (as the js row) and the platforms as an aligned table.
 * Every VERSION cell shows what the respective file says; the js row's status
 * names the target when flags overrode it, and the platforms get one label
 * each, in the order of status.platforms.
 */
function renderStatus(
  status: VersionStatus,
  labels: string[],
  configuration?: string,
): string {
  const { target } = status;
  const rows = [
    ['PLATFORM', 'APP ID', 'VERSION', 'STATUS'],
    [
      'js',
      status.packageName ?? '',
      status.packageVersion ?? '',
      status.overridden
        ? `overridden ${target.versionName} (${target.versionCode})`
        : '',
    ],
  ];

  for (const platform of PLATFORMS) {
    const name =
      platform === 'ios' && configuration ? `ios (${configuration})` : platform;
    const index = status.platforms.findIndex((p) => p.platform === platform);
    if (index >= 0) {
      const { appId, versionName, versionCode } = status.platforms[index];
      rows.push([
        name,
        appId,
        `${versionName} (${versionCode})`,
        labels[index],
      ]);
    } else if (status.missing.includes(platform)) {
      rows.push([name, '', '', `not found, pass --skip-${platform} to ignore`]);
    }
  }

  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((row) => row[i].length)),
  );
  return rows
    .map((row) =>
      row
        .map((cell, i) => cell.padEnd(widths[i]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

program
  .name('rn-versioning')
  .description(
    'Compare the package.json version with the native projects, or sync them with --write',
  )
  .version(packageJson.version)
  .addHelpText(
    'after',
    `
Project-wide defaults for --reserve-builds, --skip-android, --skip-ios,
--gradle-path, --pbxproj-path and --configuration can be set in package.json,
where a command line option takes precedence:

  "rnVersioning": { "reserveBuilds": 100 }

--print-store-version-codes and --print-next-version-code read the store
credentials from the environment: PLAY_SERVICE_ACCOUNT_JSON (content of a
service account JSON key) for Google Play, and ASC_KEY_ID, ASC_ISSUER_ID and
ASC_PRIVATE_KEY (content of the .p8 file) for App Store Connect.`,
  )
  .option('--write', 'Update the native files instead of only comparing them')
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
    '--reserve-builds <n>',
    'Reserve N build slots per version (e.g. 100 turns 10203 into 1020300)',
    parseInteger,
  )
  .option('--skip-android', 'Ignore the Android project')
  .option('--skip-ios', 'Ignore the iOS project')
  .option(
    '--project-dir <dir>',
    'Project root directory (default: current directory)',
  )
  .option(
    '--gradle-path <path>',
    'Path to Android build.gradle, relative to the project directory',
  )
  .option(
    '--pbxproj-path <path>',
    'Path to iOS project.pbxproj, relative to the project directory',
  )
  .option(
    '--configuration <name>',
    'Xcode build configuration to read iOS values from (default: Release)',
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
    '--print-env <platform>',
    'Print APP_ID, VERSION_NAME and VERSION_CODE as dotenv lines read from the native file for "android" or "ios"',
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
    '--print-store-version-codes <platform>',
    'Print the version codes in use in the store, one per line: Google Play for "android", App Store Connect for "ios"',
  )
  .option(
    '--print-next-version-code',
    'Print the next version code of the current version that is free in the stores (requires --reserve-builds)',
  )
  .option(
    '--taken <codes...>',
    'Version codes in use that the stores do not know about, for --print-next-version-code',
    collectIntegers,
  )
  .option(
    '--app-id <id>',
    'App id to query in the stores (default: read from the native files)',
  )
  .option(
    '--android-app-id <id>',
    'Google Play package name to query, where it is not --app-id',
  )
  .option(
    '--ios-app-id <id>',
    'App Store bundle id to query, where it is not --app-id',
  )
  .option(
    '--verbose',
    'Print the store requests and their raw responses to stderr',
  )
  .action(async (options) => {
    try {
      const projectDir = options.projectDir
        ? path.resolve(options.projectDir)
        : process.cwd();

      const syncOptions = {
        versionName: options.versionName,
        versionCode: options.versionCode,
        reserveBuilds: options.reserveBuilds,
        gradlePath: options.gradlePath
          ? path.resolve(projectDir, options.gradlePath)
          : undefined,
        pbxprojPath: options.pbxprojPath
          ? path.resolve(projectDir, options.pbxprojPath)
          : undefined,
        skipAndroid: options.skipAndroid,
        skipIos: options.skipIos,
        configuration: options.configuration,
      };

      const activePrints = Object.keys(printFlags).filter(
        (key) => options[key] !== undefined,
      );

      const modes = activePrints.map((key) => printFlags[key].flag);
      if (options.printNextVersionCode) {
        modes.push('--print-next-version-code');
      }
      if (options.write) {
        modes.push('--write');
      }
      if (modes.length > 1) {
        throw new Error(
          `Only one of ${modes.join(', ')} may be used at a time`,
        );
      }

      if (options.format !== undefined && options.print === undefined) {
        throw new Error('--format can only be used with --print');
      }

      const { appId, androidAppId, iosAppId } = options;
      const storeOptions = {
        ...syncOptions,
        appId,
        androidAppId,
        iosAppId,
        log: options.verbose ? console.error : undefined,
      };
      const queriesStores =
        options.printStoreVersionCodes !== undefined ||
        options.printNextVersionCode;
      if (!queriesStores && (appId ?? androidAppId ?? iosAppId) !== undefined) {
        throw new Error(
          '--app-id, --android-app-id and --ios-app-id can only be used with --print-store-version-codes or --print-next-version-code',
        );
      }
      if (options.taken !== undefined && !options.printNextVersionCode) {
        throw new Error(
          '--taken can only be used with --print-next-version-code',
        );
      }

      if (options.printNextVersionCode) {
        if (options.versionCode !== undefined) {
          throw new Error(
            '--version-code cannot be used with --print-next-version-code',
          );
        }
        const config = loadConfig(projectDir);
        const skipped = {
          android: options.skipAndroid ?? config.skipAndroid,
          ios: options.skipIos ?? config.skipIos,
        };
        const next = await getNextVersionCode(
          projectDir,
          readStoreCredentials(PLATFORMS.filter((p) => !skipped[p])),
          { ...storeOptions, taken: options.taken },
        );
        process.stdout.write(`${next}\n`);
        return;
      }

      if (activePrints.length === 1) {
        const [key] = activePrints;
        const platform: string = options[key];
        if (platform !== 'android' && platform !== 'ios') {
          throw new Error(`${printFlags[key].flag} must be "android" or "ios"`);
        }
        if (options.configuration !== undefined && platform !== 'ios') {
          throw new Error('--configuration does not apply to android');
        }

        if (key === 'printStoreVersionCodes') {
          const codes = await getStoreVersionCodes(
            projectDir,
            platform,
            readStoreCredentials([platform]),
            storeOptions,
          );
          process.stdout.write(codes.map((code) => `${code}\n`).join(''));
          return;
        }

        if (key === 'printEnv') {
          const values = readNativeValues(projectDir, platform, syncOptions);
          process.stdout.write(formatEnv(values));
          return;
        }

        const template =
          printFlags[key].template ?? options.format ?? DEFAULT_TEMPLATE;
        const output = formatTemplate(
          template,
          projectDir,
          platform,
          syncOptions,
        );
        process.stdout.write(`${output}\n`);
        return;
      }

      // Label the iOS row with the configuration the values are read from
      const configuration =
        options.configuration ?? loadConfig(projectDir).configuration;

      if (options.write) {
        const result = syncVersions(projectDir, syncOptions);
        const labels = result.platforms.map((p) =>
          p.updated ? 'updated' : 'unchanged',
        );
        console.log(renderStatus(result, labels, configuration));
        return;
      }

      const status = checkVersions(projectDir, syncOptions);
      const labels = status.platforms.map((p) =>
        p.inSync ? 'ok' : 'outdated',
      );
      console.log(renderStatus(status, labels, configuration));
      if (status.platforms.some((p) => !p.inSync)) {
        console.error('Run with --write to update the native files.');
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program.parseAsync();
