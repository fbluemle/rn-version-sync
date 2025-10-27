const fs = require('fs');
const path = require('path');
const {syncVersions, getPackageVersion, updateIOSVersion, updateAndroidVersion} = require('./dist/index');

// Create test directory structure
const testDir = path.join(__dirname, 'test-project');

function setup() {
  console.log('Setting up test project...');

  // Clean up if exists
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, {recursive: true, force: true});
  }

  // Create directories
  fs.mkdirSync(testDir, {recursive: true});
  fs.mkdirSync(path.join(testDir, 'android', 'app'), {recursive: true});
  fs.mkdirSync(path.join(testDir, 'ios', 'testapp.xcodeproj'), {recursive: true});

  // Create package.json
  fs.writeFileSync(
    path.join(testDir, 'package.json'),
    JSON.stringify({name: 'test-app', version: '1.2.3'}, null, 2)
  );

  // Create build.gradle
  const gradleContent = `android {
    defaultConfig {
        applicationId "com.testapp"
        versionCode 1
        versionName "1.0.0"
    }
}`;
  fs.writeFileSync(path.join(testDir, 'android', 'app', 'build.gradle'), gradleContent);

  // Create project.pbxproj
  const pbxprojContent = `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 54;
	objects = {
		/* Begin XCBuildConfiguration section */
		13B07F941A680F5B00A75B9A /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CURRENT_PROJECT_VERSION = 1;
				MARKETING_VERSION = 1.0.0;
			};
			name = Debug;
		};
		13B07F951A680F5B00A75B9A /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CURRENT_PROJECT_VERSION = 1;
				MARKETING_VERSION = 1.0.0;
			};
			name = Release;
		};
		/* End XCBuildConfiguration section */
	};
	rootObject = 83CBB9F71A601CBA00E9B192 /* Project object */;
}`;
  fs.writeFileSync(path.join(testDir, 'ios', 'testapp.xcodeproj', 'project.pbxproj'), pbxprojContent);

  console.log('✓ Test project created\n');
}

function runTests() {
  console.log('Running tests...\n');

  // Test 1: getPackageVersion
  console.log('Test 1: Reading version from package.json');
  const version = getPackageVersion(testDir);
  console.assert(version === '1.2.3', 'Version should be 1.2.3');
  console.log(`✓ Got version: ${version}\n`);

  // Test 2: syncVersions
  console.log('Test 2: Syncing versions');
  syncVersions(testDir, {verbose: true});
  console.log('');

  // Verify Android changes
  console.log('Test 3: Verifying Android version changes');
  const gradlePath = path.join(testDir, 'android', 'app', 'build.gradle');
  const gradleContent = fs.readFileSync(gradlePath, 'utf8');
  console.assert(
    gradleContent.includes('versionName "1.2.3"'),
    'build.gradle should contain versionName "1.2.3"'
  );
  console.assert(
    gradleContent.includes('versionCode 10203'),
    'build.gradle should have versionCode 10203 (calculated from 1.2.3)'
  );
  console.log('✓ Android versions updated correctly\n');

  // Verify iOS changes
  console.log('Test 4: Verifying iOS version changes');
  const pbxprojPath = path.join(testDir, 'ios', 'testapp.xcodeproj', 'project.pbxproj');
  const pbxprojContent = fs.readFileSync(pbxprojPath, 'utf8');
  console.assert(
    pbxprojContent.includes('MARKETING_VERSION = 1.2.3;'),
    'project.pbxproj should contain MARKETING_VERSION = 1.2.3'
  );
  console.assert(
    pbxprojContent.includes('CURRENT_PROJECT_VERSION = 10203;'),
    'project.pbxproj should contain CURRENT_PROJECT_VERSION = 10203 (calculated from 1.2.3)'
  );
  console.log('✓ iOS versions updated correctly\n');

  // Test 5: Run sync again to verify versionCode stays the same (deterministic)
  console.log('Test 5: Testing versionCode remains deterministic on second run');
  syncVersions(testDir, {verbose: true});
  const gradleContent2 = fs.readFileSync(gradlePath, 'utf8');
  console.assert(
    gradleContent2.includes('versionCode 10203'),
    'build.gradle should still have versionCode 10203 (deterministic)'
  );
  console.log('✓ versionCode remains deterministic\n');
}

function cleanup() {
  console.log('Cleaning up...');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, {recursive: true, force: true});
  }
  console.log('✓ Test project cleaned up\n');
}

// Run all tests
try {
  setup();
  runTests();
  cleanup();
  console.log('✓ All tests passed!');
} catch (error) {
  console.error('✗ Test failed:', error.message);
  console.error(error.stack);
  cleanup();
  process.exit(1);
}
