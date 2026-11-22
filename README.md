# rn-versioning

Fast and simple utility to sync the React Native version with native code
(Android and iOS) and find the next version code in the stores.

Published as `rn-version-sync` up to 0.10.0.

[![ci][1]][2]

## What it does

Reads the `version` from `package.json` and writes it to the native projects:

| Platform | File                                      | Version name        | Version code              |
| -------- | ----------------------------------------- | ------------------- | ------------------------- |
| Android  | `android/app/build.gradle`                | `versionName`       | `versionCode`             |
| iOS      | `ios/<Project>.xcodeproj/project.pbxproj` | `MARKETING_VERSION` | `CURRENT_PROJECT_VERSION` |

The version code is calculated from semver as
`10000 * major + 100 * minor + patch`. The same version always produces the
same code, higher versions produce higher codes, and both platforms get the
identical value:

| Version    | Version code |
| ---------- | ------------ |
| `1.0.0`    | `10000`      |
| `1.2.3`    | `10203`      |
| `2.5.10`   | `20510`      |
| `12.34.56` | `123456`     |

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
$ npx rn-versioning
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
$ npx rn-versioning --write
PLATFORM  APP ID           VERSION        STATUS
js        example-app      1.2.3
android   com.example.app  1.2.3 (10203)  unchanged
ios       com.example.app  1.2.3 (10203)  updated
```

To keep the native files in step with `npm version`, install it as a dev
dependency and hook it into the `version` lifecycle:

```bash
npm install --save-dev rn-versioning
# or
yarn add -D rn-versioning
```

```json
{
  "scripts": {
    "version": "rn-versioning --write && git add -u"
  }
}
```

Now `npm version patch|minor|major` bumps `package.json` and the native files
together, in one commit.

A platform whose native file cannot be found is listed as `not found` (pass
`--skip-android` or `--skip-ios` to leave it out), and the command fails when
no native file is left.

### Options

| Option                         | Description                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `--write`                      | Update the native files instead of only comparing them                                                                |
| `--version-name <name>`        | Use this version name instead of the `package.json` version. Requires `--version-code` unless it is semver.           |
| `--version-code <code>`        | Use this version code instead of the calculated one                                                                   |
| `--reserve-builds <n>`         | Multiply the calculated version code by `n` (see below)                                                               |
| `--skip-android`, `--skip-ios` | Ignore that platform                                                                                                  |
| `--project-dir <dir>`          | Project root (default: current directory)                                                                             |
| `--gradle-path <path>`         | Android `build.gradle` to use, instead of `android/app/build.gradle`                                                  |
| `--pbxproj-path <path>`        | iOS `project.pbxproj` to use, instead of the first `.xcodeproj` in `ios/`                                             |
| `--configuration <name>`       | Xcode build configuration to read the iOS values from, in the table and with the `--print*` flags (default `Release`) |

Relative `--gradle-path` and `--pbxproj-path` values are resolved against the
project directory. Version codes must be positive integers up to
`2147483647`, the 32-bit limit both platforms enforce.

`--reserve-builds` makes each version own `n` consecutive codes, e.g. for CI
builds that bump the code per build (`100` turns `10203` into `1020300`). It
is ignored with `--version-code`, and best set once as `reserveBuilds` in
`package.json`, see [Configuration](#configuration).

### Configuration

Settings that are permanent for a project go under the `rnVersioning` key
of `package.json`, so the check, `--write` and the `version` script all use
the same values without repeating them on every call:

```json
{
  "rnVersioning": {
    "reserveBuilds": 100
  }
}
```

| Setting                            | Option                         |
| ---------------------------------- | ------------------------------ |
| `reserveBuilds` (integer)          | `--reserve-builds`             |
| `gradlePath` (string)              | `--gradle-path`                |
| `pbxprojPath` (string)             | `--pbxproj-path`               |
| `configuration` (string)           | `--configuration`              |
| `skipAndroid`, `skipIos` (boolean) | `--skip-android`, `--skip-ios` |

A command line option takes precedence over the configured value. Relative
paths are resolved against the project directory, and an unknown setting or a
value of the wrong type is an error.

The `rnVersionSync` key used up to 0.10.0 and the `rn-version-sync` key used
by 0.8.0 are still read, with a warning, until 1.0.0. Rename either to
`rnVersioning` to keep the configuration working.

## Reading values from native files

The `--print*` flags read what is actually written in the native files instead
of comparing. They print the requested value to stdout and nothing else, which
makes them handy for CI scripts that tag releases in Sentry, GitHub, and the
like. `--gradle-path` and `--pbxproj-path` apply here as well.

### Single values

```bash
npx rn-versioning --print-version-name android
# 1.2.3

npx rn-versioning --print-version-code ios
# 10203

npx rn-versioning --print-app-id ios
# com.example.app

npx rn-versioning --print-app-id ios --configuration Staging
# com.example.app.staging
```

### All values, or a custom format

```bash
npx rn-versioning --print ios
# appId: com.example.app
# versionName: 1.2.3
# versionCode: 10203

npx rn-versioning --print ios --format '{appId}@{versionName}+{versionCode}'
# com.example.app@1.2.3+10203
```

Placeholders are `{appId}`, `{versionName}` and `{versionCode}`. Anything else
in the template is printed as is, and an unknown placeholder is an error. Only
the referenced values are read, so a template without `{appId}` works in
projects where the app id cannot be resolved. Values are inserted as written
in the native file. For example, a Sentry release id is one call:

```bash
RELEASE=$(npx rn-versioning --print ios --format '{appId}@{versionName}+{versionCode}')
sentry-cli releases new "$RELEASE"
```

### Environment variables

```bash
npx rn-versioning --print-env ios
# APP_ID=com.example.app
# VERSION_NAME=1.2.3
# VERSION_CODE=10203
```

Nothing is printed unless all three values resolve, so a failure cannot leave
a partial set of variables behind. Values are limited to `A-Z a-z 0-9 . _ + -`,
which keeps the output safe to `eval` or append to `GITHUB_ENV` without
quoting:

```bash
vars=$(npx rn-versioning --print-env ios) && eval "$vars"
sentry-cli releases new "$APP_ID@$VERSION_NAME+$VERSION_CODE"
sentry-cli releases files "$APP_ID@$VERSION_NAME+$VERSION_CODE" \
  upload-sourcemaps --dist "$VERSION_CODE" build/
```

Assign the output to a variable before `eval` as shown: a plain
`eval "$(...)"` would hide the exit status of a failing command. In GitHub
Actions the output can go straight into the environment of the following
steps:

```yaml
- run: npx rn-versioning --print-env ios >> "$GITHUB_ENV"
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

## Version codes in the stores

A store rejects a version code it has seen before. When every CI build gets
its own code out of the range reserved with `reserveBuilds`, the stores are
therefore the source of truth for which codes are taken. Two flags query
them, Google Play for `android` and App Store Connect for `ios`:

```bash
npx rn-versioning --print-store-version-codes android
# 1020301
# 1020302

npx rn-versioning --print-next-version-code
# 1020303
```

| Option                                   | Description                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `--print-store-version-codes <platform>` | Print the version codes in use in the store, one per line in ascending order  |
| `--print-next-version-code`              | Print the next version code of the current version that is free in the stores |
| `--taken <codes...>`                     | Further version codes in use, for `--print-next-version-code`                 |
| `--app-id <id>`                          | App id to query in the stores, instead of the one in the native files         |
| `--android-app-id <id>`                  | Google Play package name to query, where it is not `--app-id`                 |
| `--ios-app-id <id>`                      | App Store bundle id to query, where it is not `--app-id`                      |
| `--verbose`                              | Print the store requests and their raw responses to stderr                    |

The requests are made with Node's built-in `fetch` and `crypto`, without
further dependencies.

`--verbose` prints every store request with the status and raw body of its
response to stderr, which leaves the output on stdout as it is. For App Store
Connect this includes the upload date and processing state of each build.
The token request to Google is not printed, as its response is a secret.

### Credentials

Credentials are read from the environment, as content rather than as file
paths:

| Variable                    | Value                                              |
| --------------------------- | -------------------------------------------------- |
| `PLAY_SERVICE_ACCOUNT_JSON` | Google Play: content of a service account JSON key |
| `ASC_KEY_ID`                | App Store Connect: ID of an API team key           |
| `ASC_ISSUER_ID`             | App Store Connect: issuer ID of the key            |
| `ASC_PRIVATE_KEY`           | App Store Connect: content of the key's `.p8` file |

Only the variables of the queried stores are required. The service account
needs access to the app in Play Console, and the role of the API key must
allow listing builds. With key files at hand, pass their content:

```bash
PLAY_SERVICE_ACCOUNT_JSON=$(cat play.json) \
  npx rn-versioning --print-store-version-codes android
```

### Which codes are found

- Google Play: the version codes of the app's current bundles and APKs. One
  that a later release has replaced is no longer listed, so this is not a
  history of all uploads. Play only lists them inside an edit, so the command
  opens one and deletes it again without committing it, which changes nothing
  in Play.
- App Store Connect: the build numbers of all builds of the app, expired ones
  included. Build numbers that are not plain integers, such as `1.2.3`, are
  left out.

The app is the one named by the app id in the native file, read in the same
way as by `--print-app-id` (on iOS from the build configuration given by
`--configuration`). Where that is not the id in the store, for example with
an `applicationIdSuffix` or product flavors on Android, name it with
`--app-id`, or with `--android-app-id` and `--ios-app-id` where the two
stores differ.

### The next version code

`--print-next-version-code` requires `reserveBuilds` of at least 2. With
`n` reserved builds, a version owns the `n` codes starting at its calculated
code. That first code is the one `--write` puts into the native files, and
builds get the ones after it: with `reserveBuilds` of `100`, version `1.2.3`
owns `1020300` to `1020399`, and its builds are numbered from `1020301`.

The command prints the code above the highest one in use, where in use means
found in the store of a platform that is not skipped, listed with `--taken`,
or the first code of the version. Codes of earlier versions do not matter,
and gaps below the highest code are not filled. It fails instead of printing
a code when no code of the version is left, and when a code of a later
version is already in use.

The stores do not know about everything: a build appears in App Store
Connect only some minutes after its upload, a build that failed before the
upload never does, Google Play no longer lists a code once it is not
current, and two runs started at the same time see the same state.
Covering this is up to the caller, which can keep its own record of the codes
it handed out and pass them with `--taken`. In CI this could be a git ref per
code, created with a push that fails if the ref exists:

```bash
taken=$(git ls-remote origin 'refs/builds/*' | sed 's|.*/||')
code=$(npx rn-versioning --print-next-version-code \
  ${taken:+--taken $taken})
git push --force-with-lease="refs/builds/$code:" origin "HEAD:refs/builds/$code"
npx rn-versioning --write --version-code "$code"
```

## Programmatic use

The same functionality is available as a module, with type definitions:

```js
const {
  checkVersions,
  syncVersions,
  readNativeValues,
  loadConfig,
  getStoreVersionCodes,
  getNextVersionCode,
} = require('rn-versioning');

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

const credentials = {
  android: process.env.PLAY_SERVICE_ACCOUNT_JSON,
  ios: {
    keyId: process.env.ASC_KEY_ID,
    issuerId: process.env.ASC_ISSUER_ID,
    privateKey: process.env.ASC_PRIVATE_KEY,
  },
};

await getStoreVersionCodes(process.cwd(), 'ios', credentials);
// [1020301, 1020302]

await getNextVersionCode(process.cwd(), credentials, { taken: [1020303] });
// 1020304
```

`resolveVersions`, `formatTemplate` and `formatEnv` back the target row,
`--format` and `--print-env` in the same way. Like the CLI, all functions fill
in options that are not passed explicitly from the `rnVersioning`
configuration in `package.json`. The two store functions are asynchronous and
take their credentials as an argument instead of reading the environment;
a `log` function in their options receives what `--verbose` prints.
`getPlayVersionCodes` and `getAppStoreVersionCodes` query a store by app id
without a project directory, and `nextVersionCode` is the calculation alone.

## Requirements

- Node.js >= 20
- A standard React Native project layout as shown above, or explicit
  `--gradle-path` / `--pbxproj-path`

## Similar tools

- [react-native-version][3]
- [rn-version][4]

## License

MIT

[1]: https://github.com/fbluemle/rn-versioning/workflows/ci/badge.svg
[2]: https://github.com/fbluemle/rn-versioning/actions
[3]: https://www.npmjs.com/package/react-native-version
[4]: https://www.npmjs.com/package/rn-version
