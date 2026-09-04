# rn-version-sync

Fast and simple utility to sync React Native version with native code (Android
and iOS).

[![ci][1]][2]

## What it does

Reads the `version` from `package.json` and writes it to the native projects:

| Platform | File | Version name | Version code |
| -------- | ---- | ------------ | ------------ |
| Android | `android/app/build.gradle` | `versionName` | `versionCode` |
| iOS | `ios/<Project>.xcodeproj/project.pbxproj` | `MARKETING_VERSION` | `CURRENT_PROJECT_VERSION` |

The version code is calculated from semver as
`10000 * major + 100 * minor + patch`. The same version always produces the
same code, higher versions produce higher codes, and both platforms get the
identical value:

| Version | Version code |
| ------- | ------------ |
| `1.0.0` | `10000` |
| `1.2.3` | `10203` |
| `2.5.10` | `20510` |
| `12.34.56` | `123456` |

Pre-release and build metadata (`1.2.3-beta.1`) are ignored when calculating
the code; the version name is written as is. Only the version lines are
modified, everything else in the files stays untouched. On iOS, every
`MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in the project file is
updated, so app, test and extension targets stay in step as Xcode requires.
A native file without these settings is an error rather than a silent
no-op.

## Usage

Without arguments, the command compares the native files with the version in
`package.json` and exits with status 1 when a platform is out of sync, which
makes it usable as a CI check:

```
$ npx rn-version-sync
PLATFORM  APP ID           VERSION        STATUS
js        example-app      1.2.3
android   com.example.app  1.2.3 (10203)  ok
ios       com.example.app  1.2.2 (10202)  outdated
Run with --write to update the native files.
```

Every row shows what its file says: `name` and `version` from `package.json`
in the `js` row, and app id, version name and version code from the native
files. When `--version-name` or `--version-code` replace the `package.json`
values, the `js` row's status names the target, for example
`overridden 2.0.0 (20000)`. Add `--write` to update the native files:

```
$ npx rn-version-sync --write
PLATFORM  APP ID           VERSION        STATUS
js        example-app      1.2.3
android   com.example.app  1.2.3 (10203)  unchanged
ios       com.example.app  1.2.3 (10203)  updated
```

To keep the native files in step with `npm version`, install it as a dev
dependency and hook it into the `version` lifecycle:

```bash
npm install --save-dev rn-version-sync
# or
yarn add -D rn-version-sync
```

```json
{
  "scripts": {
    "version": "rn-version-sync --write && git add -u"
  }
}
```

Now `npm version patch|minor|major` bumps `package.json` and the native files
together, in one commit.

A platform whose native file cannot be found is listed as `not found` (pass
`--skip-android` or `--skip-ios` to leave it out), and the command fails when
no native file is left.

### Options

| Option | Description |
| ------ | ----------- |
| `--write` | Update the native files instead of only comparing them |
| `--version-name <name>` | Use this version name instead of the `package.json` version. Requires `--version-code` unless it is semver. |
| `--version-code <code>` | Use this version code instead of the calculated one |
| `--reserve-builds <n>` | Multiply the calculated version code by `n` so each version owns `n` consecutive codes, e.g. for CI builds that bump the code per build (`100` turns `10203` into `1020300`). Ignored with `--version-code`. Best set once as `reserveBuilds` in `package.json`, see [Configuration](#configuration). |
| `--skip-android`, `--skip-ios` | Ignore that platform |
| `--project-dir <dir>` | Project root (default: current directory) |
| `--gradle-path <path>` | Android `build.gradle` to use, instead of `android/app/build.gradle` |
| `--pbxproj-path <path>` | iOS `project.pbxproj` to use, instead of the first `.xcodeproj` in `ios/` |
| `--configuration <name>` | Xcode build configuration to read the iOS values from, in the table and with the `--print*` flags (default `Release`) |

Relative `--gradle-path` and `--pbxproj-path` values are resolved against the
project directory. Version codes must be positive integers up to
`2147483647`, the 32-bit limit both platforms enforce.

### Configuration

Settings that are permanent for a project go under the `rn-version-sync` key
of `package.json`, so the check, `--write` and the `version` script all use
the same values without repeating them on every call:

```json
{
  "rn-version-sync": {
    "reserveBuilds": 100
  }
}
```

| Setting | Option |
| ------- | ------ |
| `reserveBuilds` (integer) | `--reserve-builds` |
| `gradlePath` (string) | `--gradle-path` |
| `pbxprojPath` (string) | `--pbxproj-path` |
| `configuration` (string) | `--configuration` |
| `skipAndroid`, `skipIos` (boolean) | `--skip-android`, `--skip-ios` |

A command line option takes precedence over the configured value. Relative
paths are resolved against the project directory, and an unknown setting or a
value of the wrong type is an error.

## Reading values from native files

The `--print*` flags read what is actually written in the native files instead
of comparing. They print the requested value to stdout and nothing else, which
makes them handy for CI scripts that tag releases in Sentry, GitHub, and the
like. `--gradle-path` and `--pbxproj-path` apply here as well.

### Single values

```bash
npx rn-version-sync --print-version-name android
# 1.2.3

npx rn-version-sync --print-version-code ios
# 10203

npx rn-version-sync --print-app-id ios
# com.example.app

npx rn-version-sync --print-app-id ios --configuration Staging
# com.example.app.staging
```

### All values, or a custom format

```bash
npx rn-version-sync --print ios
# appId: com.example.app
# versionName: 1.2.3
# versionCode: 10203

npx rn-version-sync --print ios --format '{appId}@{versionName}+{versionCode}'
# com.example.app@1.2.3+10203
```

Placeholders are `{appId}`, `{versionName}` and `{versionCode}`. Anything else
in the template is printed as is, and an unknown placeholder is an error. Only
the referenced values are read, so a template without `{appId}` works in
projects where the app id cannot be resolved. Values are inserted as written
in the native file. For example, a Sentry release id is one call:

```bash
RELEASE=$(npx rn-version-sync --print ios --format '{appId}@{versionName}+{versionCode}')
sentry-cli releases new "$RELEASE"
```

### Environment variables

```bash
npx rn-version-sync --print-env ios
# APP_ID=com.example.app
# VERSION_NAME=1.2.3
# VERSION_CODE=10203
```

Nothing is printed unless all three values resolve, so a failure cannot leave
a partial set of variables behind. Values are limited to `A-Z a-z 0-9 . _ + -`,
which keeps the output safe to `eval` or append to `GITHUB_ENV` without
quoting:

```bash
vars=$(npx rn-version-sync --print-env ios) && eval "$vars"
sentry-cli releases new "$APP_ID@$VERSION_NAME+$VERSION_CODE"
sentry-cli releases files "$APP_ID@$VERSION_NAME+$VERSION_CODE" \
  upload-sourcemaps --dist "$VERSION_CODE" build/
```

Assign the output to a variable before `eval` as shown: a plain
`eval "$(...)"` would hide the exit status of a failing command. In GitHub
Actions the output can go straight into the environment of the following
steps:

```yaml
- run: npx rn-version-sync --print-env ios >> "$GITHUB_ENV"
- run: sentry-cli releases new "$APP_ID@$VERSION_NAME+$VERSION_CODE"
```

### How values are read

- Android version name and code are the first `versionName` / `versionCode`
  in `build.gradle`; projects with flavor overrides may need to read them
  some other way. The app id is the `applicationId` literal. Build type
  `applicationIdSuffix` values are not applied, and if flavors declare their
  own `applicationId`, the command fails instead of guessing.
- All iOS values (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` and
  `PRODUCT_BUNDLE_IDENTIFIER`) come from the application target's build
  configuration named by `--configuration` (default `Release`). The
  configuration is located through the target's configuration list, not by
  position in the file, so test and extension targets do not interfere. A
  setting missing from the target's configuration falls back to the
  project-level configuration of the same name, as in Xcode. The command
  fails if the project has several application targets, if the configuration
  does not exist, or if a value is a build setting variable such as
  `$(PRODUCT_NAME:rfc1034identifier)`. xcconfig files are not resolved.

## Programmatic use

The same functionality is available as a module, with type definitions:

```js
const { checkVersions, syncVersions, readNativeValues, loadConfig } = require('rn-version-sync');

checkVersions(process.cwd());
// {
//   packageName: 'example-app',
//   packageVersion: '1.2.3',
//   target: { versionName: '1.2.3', versionCode: 10203 },
//   overridden: false,
//   platforms: [
//     { platform: 'android', path: '/app/android/app/build.gradle', appId: 'com.example.app', versionName: '1.2.3', versionCode: '10203', inSync: true },
//     { platform: 'ios', path: '/app/ios/App.xcodeproj/project.pbxproj', appId: 'com.example.app', versionName: '1.2.2', versionCode: '10202', inSync: false },
//   ],
//   missing: [],
// }

syncVersions(process.cwd(), { reserveBuilds: 100 });
// same shape, read back after writing, with an `updated` flag per platform

readNativeValues(process.cwd(), 'ios', { configuration: 'Staging' });
// { appId: 'com.example.app.staging', versionName: '1.2.3', versionCode: '1020300' }

loadConfig(process.cwd());
// { reserveBuilds: 100 }
```

`resolveVersions`, `formatTemplate` and `formatEnv` back the target row,
`--format` and `--print-env` in the same way. Like the CLI, all functions fill
in options that are not passed explicitly from the `rn-version-sync`
configuration in `package.json`.

## Requirements

- Node.js >= 20
- A standard React Native project layout as shown above, or explicit
  `--gradle-path` / `--pbxproj-path`

## Similar tools

- [react-native-version][3]
- [rn-version][4]

## License

MIT

[1]: https://github.com/fbluemle/rn-version-sync/workflows/ci/badge.svg
[2]: https://github.com/fbluemle/rn-version-sync/actions
[3]: https://www.npmjs.com/package/react-native-version
[4]: https://www.npmjs.com/package/rn-version
