# rn-version-sync

Fast and simple utility to sync React Native version with native code (Android
and iOS).

[![ci][1]][2]

## Features

- **Simple & Fast**: Minimal dependencies, quick execution
- **Auto-detection**: Automatically finds Android and iOS files
- **Smart Updates**: Only modifies version-related lines in native files
- **Deterministic Version Codes**: Calculates version codes from semver
- **npm Integration**: Designed to work seamlessly with `npm version` lifecycle
- **Zero Config**: Works out of the box with standard React Native projects

## What It Does

- Syncs `package.json` version → Android `versionName`
- Calculates and sets Android `versionCode` using formula:
  `10000*major + 100*minor + patch`
- Syncs `package.json` version → iOS `MARKETING_VERSION` (version name)
- Calculates and sets iOS `CURRENT_PROJECT_VERSION` (version code)
- Example: version `1.2.3` produces version code `10203`

## Installation & Usage

### Option 1: One-off execution with npx

```bash
npx rn-version-sync
```

### Option 2: Install as dev dependency

```bash
npm install --save-dev rn-version-sync
# or
yarn add -D rn-version-sync
```

Add to your `package.json`:

```json
{
  "scripts": {
    "version": "rn-version-sync && git add -u"
  }
}
```

Now when you run:

```bash
npm version patch
npm version minor
npm version major
```

Your native Android and iOS versions will automatically sync!

### Options

**Verbose mode** - See detailed output:

```bash
npx rn-version-sync --verbose
```

**Override version code** - Manually specify version code:

```bash
npx rn-version-sync --version-code 42
```

By default, version code is calculated from semver. Use this option if you need
a specific version code that doesn't follow the formula.

**Read the current version from native files** - Print the version name
or version code as written in the native build files. Useful for CI
scripts that need to reference what was actually built (e.g. tagging a
release in Sentry, GitHub, etc.):

```bash
npx rn-version-sync --print-version-name android
# 1.2.3

npx rn-version-sync --print-version-code android
# 10203

npx rn-version-sync --print-version-name ios
# 1.2.3

npx rn-version-sync --print-version-code ios
# 10203
```

Each flag prints a single value (and nothing else) to stdout, read
directly from the native file:

- `android` → `versionName` / `versionCode` from `android/app/build.gradle`
- `ios` → `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` from `project.pbxproj`

The first match in the file wins, so projects with flavors or
per-configuration overrides may need to read the value some other way.

**Read the app identifier** - Print the application id as written in the
native project:

```bash
npx rn-version-sync --print-app-id android
# com.example.app

npx rn-version-sync --print-app-id ios
# com.example.app

npx rn-version-sync --print-app-id ios --configuration Staging
# com.example.app.staging
```

- `android` → the `applicationId` literal in `android/app/build.gradle`.
  Build type `applicationIdSuffix` values are not applied. If flavors
  declare their own `applicationId`, the command fails instead of guessing.
- `ios` → `PRODUCT_BUNDLE_IDENTIFIER` of the application target's build
  configuration named by `--configuration` (default `Release`). The
  configuration is located through the target's configuration list, not by
  position in the file, so test and extension targets do not interfere.
  The command fails if the project has several application targets, if the
  configuration does not exist, or if the value is a build setting variable
  such as `$(PRODUCT_NAME:rfc1034identifier)`. Only settings in
  `project.pbxproj` are read; xcconfig files are not resolved.

**Print everything as environment variables** - Print the app id, version
name and version code of one platform as dotenv lines:

```bash
npx rn-version-sync --print-env ios
# APP_ID=com.example.app
# VERSION_NAME=1.2.3
# VERSION_CODE=10203
```

- The values are read exactly like the individual `--print-*` flags above,
  including `--configuration` for the iOS app id.
- Nothing is printed unless all three values resolve, so a failure cannot
  leave a partial set of variables behind.
- Values are limited to `A-Z a-z 0-9 . _ + -`. Anything else is an error,
  which keeps the output safe to `eval` or append to `GITHUB_ENV` without
  quoting.

**Print all values, or a custom format** - Without `--format`, `--print`
lists the app id, version name and version code of one platform in the
style of `--dry-run`. With `--format`, it fills a template instead:

```bash
npx rn-version-sync --print ios
# appId: com.example.app
# versionName: 1.2.3
# versionCode: 10203

npx rn-version-sync --print ios --format '{appId}@{versionName}+{versionCode}'
# com.example.app@1.2.3+10203
```

- Placeholders are `{appId}`, `{versionName}` and `{versionCode}`; an
  unknown placeholder is an error. Everything else in the template is
  printed as is.
- Only the referenced values are read, so a template without `{appId}`
  works in projects where the app id cannot be resolved.
- Values are inserted as written in the native file, without the
  character check that `--print-env` applies. `--configuration` selects
  the iOS build configuration for `{appId}`.

For example, a Sentry release id (`<appId>@<versionName>+<versionCode>`)
is one call:

```bash
RELEASE=$(npx rn-version-sync --print ios --format '{appId}@{versionName}+{versionCode}')
sentry-cli releases new "$RELEASE"
```

When a script needs several of the values, `--print-env` provides them
in one call instead:

```bash
vars=$(npx rn-version-sync --print-env ios) && eval "$vars"
sentry-cli releases new "$APP_ID@$VERSION_NAME+$VERSION_CODE"
sentry-cli releases files "$APP_ID@$VERSION_NAME+$VERSION_CODE" \
  upload-sourcemaps --dist "$VERSION_CODE" build/
```

Assign the output to a variable before `eval` as shown: a plain
`eval "$(...)"` would hide the exit status of a failing command. In GitHub
Actions the output can also go straight into the environment of the
following steps:

```yaml
- run: npx rn-version-sync --print-env ios >> "$GITHUB_ENV"
- run: sentry-cli releases new "$APP_ID@$VERSION_NAME+$VERSION_CODE"
```

## Requirements

- Node.js >= 20
- Standard React Native project structure:
    - `package.json` in project root
    - Android: `android/app/build.gradle`
    - iOS: `ios/<ProjectName>.xcodeproj/project.pbxproj`

## Example

Given a `package.json` with version `1.2.3`:

**Android build.gradle** will be updated:

```gradle
versionName "1.2.3"
versionCode 10203
```

**iOS project.pbxproj** will be updated:

```
MARKETING_VERSION = 1.2.3;
CURRENT_PROJECT_VERSION = 10203;
```

Version code calculation: `10000*1 + 100*2 + 3 = 10203`

## Version Code Formula

The version code is automatically calculated from semver using the formula:

```
versionCode = 10000 * major + 100 * minor + patch
```

Examples:

- `1.0.0` → `10000`
- `1.2.3` → `10203`
- `2.5.10` → `20510`
- `12.34.56` → `123456`

This ensures:

- **Deterministic builds**: Same version always produces same version code
- **Proper ordering**: Higher versions always have higher codes
- **Cross-platform consistency**: Android and iOS use identical codes

If you need a custom version code, use the `--version-code` flag.

## Similar tools

- [react-native-version][3]
- [rn-version][4]

## License

MIT

[1]: https://github.com/fbluemle/rn-version-sync/workflows/ci/badge.svg
[2]: https://github.com/fbluemle/rn-version-sync/actions
[3]: https://www.npmjs.com/package/react-native-version
[4]: https://www.npmjs.com/package/rn-version
