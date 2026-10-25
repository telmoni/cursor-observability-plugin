/** The Cursor manifest and the hooks file, by which Cursor installs this repository as a plugin. */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { isOurs } from '../src/hooks';
import { EVENTS } from '../src/input';

const read = (path: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as Record<string, unknown>;

describe('the Cursor manifest', () => {
  it('names the plugin at the package’s version, and its hooks file', () => {
    const manifest = read('.cursor-plugin/plugin.json');
    expect(manifest['name']).toBe('telmoni-observability');
    expect(manifest['version']).toBe(read('package.json')['version']);
    expect(manifest['hooks']).toBe('hooks/hooks.json');
  });

  it('registers each event the plugin records and no other, each running the bundle at the plugin’s root', () => {
    const file = read('hooks/hooks.json') as { version: number; hooks: Record<string, Array<{ command: string; timeout: number }>> };
    expect(file.version).toBe(1);
    expect(Object.keys(file.hooks).sort()).toEqual([...EVENTS].sort());
    for (const event of EVENTS) {
      expect(file.hooks[event]).toEqual([{ command: `node "\${CURSOR_PLUGIN_ROOT}/dist/telmoni-cursor-observability.mjs" hook ${event}`, timeout: 10 }]);
      expect(isOurs(file.hooks[event]![0])).toBe(true);
    }
  });
});
