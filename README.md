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
    "version": "rn-version-sync && git add -A"
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

## Requirements

- Node.js >= 14
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
