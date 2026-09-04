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
updated.

## Usage

Run it once with npx:

```bash
npx rn-version-sync
```

Or install it as a dev dependency and hook it into the `npm version` lifecycle:

```bash
npm install --save-dev rn-version-sync
# or
yarn add -D rn-version-sync
```

```json
{
  "scripts": {
    "version": "rn-version-sync && git add -u"
  }
}
```

Now `npm version patch|minor|major` bumps `package.json` and the native files
together, in one commit.

A platform whose native file cannot be found is skipped with a warning (pass
`--skip-android` or `--skip-ios` to silence it), and the command fails when
nothing could be synced.

### Options

| Option | Description |
| ------ | ----------- |
| `--version-name <name>` | Write this version name instead of the `package.json` version. Requires `--version-code` unless it is semver. |
| `--version-code <code>` | Write this version code instead of the calculated one |
| `--reserve-builds <n>` | Multiply the calculated version code by `n` so each version owns `n` consecutive codes, e.g. for CI builds that bump the code per build (`100` turns `10203` into `1020300`). Ignored with `--version-code`. |
| `--skip-android`, `--skip-ios` | Leave that platform untouched |
| `--project-dir <dir>` | Project root (default: current directory) |
| `--gradle-path <path>` | Android `build.gradle` to update, instead of `android/app/build.gradle` |
| `--pbxproj-path <path>` | iOS `project.pbxproj` to update, instead of the first `.xcodeproj` in `ios/` |
| `--dry-run` | Print the resolved version name and code without writing anything |
| `-v, --verbose` | Log every value and file as it is updated |

Relative `--gradle-path` and `--pbxproj-path` values are resolved against the
project directory. Version codes must be positive integers up to
`2147483647`, the 32-bit limit both platforms enforce.

## Reading values from native files

The `--print*` flags read what is actually written in the native files instead
of syncing. They print the requested value to stdout and nothing else, which
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

- Version name and code are the first `versionName` / `versionCode` (Android)
  or `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` (iOS) in the file.
  Projects with flavors or per-configuration overrides may need to read them
  some other way.
- The Android app id is the `applicationId` literal in `build.gradle`. Build
  type `applicationIdSuffix` values are not applied. If flavors declare their
  own `applicationId`, the command fails instead of guessing.
- The iOS app id is `PRODUCT_BUNDLE_IDENTIFIER` of the application target's
  build configuration named by `--configuration` (default `Release`). The
  configuration is located through the target's configuration list, not by
  position in the file, so test and extension targets do not interfere. The
  command fails if the project has several application targets, if the
  configuration does not exist, or if the value is a build setting variable
  such as `$(PRODUCT_NAME:rfc1034identifier)`. Only `project.pbxproj` is
  read; xcconfig files are not resolved.

## Programmatic use

The same functionality is available as a module, with type definitions:

```js
const { syncVersions, readNativeValues } = require('rn-version-sync');

syncVersions(process.cwd(), { reserveBuilds: 100 });
// { android: '/app/android/app/build.gradle', ios: '/app/ios/App.xcodeproj/project.pbxproj' }

readNativeValues(process.cwd(), 'ios', { configuration: 'Staging' });
// { appId: 'com.example.app.staging', versionName: '1.2.3', versionCode: '1020300' }
```

`resolveVersions`, `formatTemplate` and `formatEnv` back `--dry-run`,
`--format` and `--print-env` in the same way.

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
