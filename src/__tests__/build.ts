import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const root = path.resolve(__dirname, '..', '..');

/**
 * Build dist once before the test run so the CLI tests always exercise the
 * current sources. Equivalent to `yarn build`.
 */
export default function build(): void {
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
      '-p',
      'tsconfig.build.json',
    ],
    { cwd: root, stdio: 'inherit' },
  );
}
