import {describe, it, expect, afterEach} from 'vitest';
import {parseSemver, calculateVersionCode, getPackageVersion} from '../utils';
import {TestProject} from './helpers';

describe('parseSemver', () => {
  it('parses a standard semver string', () => {
    expect(parseSemver('1.2.3')).toEqual({major: 1, minor: 2, patch: 3});
  });

  it('parses zero components', () => {
    expect(parseSemver('0.0.0')).toEqual({major: 0, minor: 0, patch: 0});
  });

  it('strips pre-release suffix', () => {
    expect(parseSemver('1.2.3-beta.1')).toEqual({major: 1, minor: 2, patch: 3});
  });

  it('strips build metadata', () => {
    expect(parseSemver('1.2.3+build.123')).toEqual({major: 1, minor: 2, patch: 3});
  });

  it('strips both pre-release and build metadata', () => {
    expect(parseSemver('1.2.3-beta.1+build.123')).toEqual({major: 1, minor: 2, patch: 3});
  });

  it('throws on two-part version', () => {
    expect(() => parseSemver('1.2')).toThrow('Invalid semver format');
  });

  it('throws on non-numeric components', () => {
    expect(() => parseSemver('a.b.c')).toThrow('Version components must be numbers');
  });
});

describe('calculateVersionCode', () => {
  it('calculates 10000*major + 100*minor + patch', () => {
    expect(calculateVersionCode('1.2.3')).toBe(10203);
  });

  it('returns 0 for 0.0.0', () => {
    expect(calculateVersionCode('0.0.0')).toBe(0);
  });

  it('handles large major version', () => {
    expect(calculateVersionCode('200.0.0')).toBe(2000000);
  });

  it('ignores pre-release suffix', () => {
    expect(calculateVersionCode('1.2.3-rc.1')).toBe(10203);
  });

  it('throws when calculated code exceeds 32-bit signed int max', () => {
    expect(() => calculateVersionCode('999999.0.0')).toThrow('exceeds maximum value');
  });
});

describe('getPackageVersion', () => {
  let project: TestProject;

  afterEach(() => {
    project?.cleanup();
  });

  it('reads version from package.json', () => {
    project = new TestProject({version: '3.4.5', android: false, ios: false});
    expect(getPackageVersion(project.root)).toBe('3.4.5');
  });

  it('throws when package.json is missing', () => {
    project = new TestProject({android: false, ios: false});
    const {rmSync} = require('fs');
    const {join} = require('path');
    rmSync(join(project.root, 'package.json'));
    expect(() => getPackageVersion(project.root)).toThrow('package.json not found');
  });

  it('throws when version field is missing', () => {
    project = new TestProject({android: false, ios: false});
    const {writeFileSync} = require('fs');
    const {join} = require('path');
    writeFileSync(join(project.root, 'package.json'), JSON.stringify({name: 'test'}));
    expect(() => getPackageVersion(project.root)).toThrow('No "version" field');
  });
});
