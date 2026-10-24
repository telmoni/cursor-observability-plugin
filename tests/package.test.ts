/** What npm would publish: the built plugin, its license and `package.json`, nothing else. */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

describe('the package', () => {
  it('packs the built plugin and its license, and nothing else: its README stays on GitHub', () => {
    const output = JSON.parse(
      execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
    ) as unknown;
    // npm before 12 answers a list, npm 12 an object by the package's name.
    const packed = (Array.isArray(output) ? output[0] : Object.values(output as object)[0]) as { files: Array<{ path: string }> };
    const paths = packed.files.map((file) => file.path).sort();
    expect(paths).toContain('dist/telmoni-cursor-observability.mjs');
    expect(paths.filter((path) => !/^dist\/[\w-]+\.mjs$/.test(path))).toEqual(['LICENSE', 'package.json']);
  }, 30_000);
});
