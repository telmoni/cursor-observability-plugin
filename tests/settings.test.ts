import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { settingsFrom } from '../src/settings';
import { tempDir } from './helpers';

let home: { path: string; remove: () => void };

beforeEach(() => {
  home = tempDir();
});

afterEach(() => {
  home.remove();
});

const cursor = (): string => join(home.path, '.cursor');
const dir = (): string => join(cursor(), 'telmoni');

/** `telmoni.json` where setup writes it, of `mode` whatever the umask made of it. */
function keyFile(content: unknown, mode = 0o600): void {
  mkdirSync(cursor(), { recursive: true });
  const path = join(cursor(), 'telmoni.json');
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
  chmodSync(path, mode);
}

describe('the key and the endpoint', () => {
  it('come from the SDKs’ own variables first, the file read only for what they leave unset', () => {
    keyFile({ apiKey: 'tm_file', endpoint: 'https://file.example' });
    expect(settingsFrom({ TELMONI_API_KEY: 'tm_env', TELMONI_ENDPOINT: 'https://env.example' }, home.path)).toStrictEqual({ apiKey: 'tm_env', endpoint: 'https://env.example', dir: dir() });
    expect(settingsFrom({ TELMONI_API_KEY: 'tm_env' }, home.path)).toStrictEqual({ apiKey: 'tm_env', endpoint: 'https://file.example', dir: dir() });
    expect(settingsFrom({}, home.path)).toStrictEqual({ apiKey: 'tm_file', endpoint: 'https://file.example', dir: dir() });
  });

  it.skipIf(process.platform === 'win32')('are read from the file only where it is shut to everyone but its owner, as ssh reads a key', () => {
    for (const mode of [0o644, 0o640, 0o604, 0o620]) {
      keyFile({ apiKey: 'tm_file', endpoint: 'https://elsewhere.example' }, mode);
      expect(settingsFrom({}, home.path)).toStrictEqual({ apiKey: undefined, endpoint: undefined, dir: dir(), keyFileProblem: 'open to other users; chmod 600 it' });
    }
    // With the key in the environment, the file still names what it may have held, the endpoint among it.
    expect(settingsFrom({ TELMONI_API_KEY: 'tm_env' }, home.path)).toMatchObject({ apiKey: 'tm_env', endpoint: undefined, keyFileProblem: 'open to other users; chmod 600 it' });
    // Both in the environment, the file is never read.
    expect(settingsFrom({ TELMONI_API_KEY: 'tm_env', TELMONI_ENDPOINT: 'https://env.example' }, home.path)).toStrictEqual({ apiKey: 'tm_env', endpoint: 'https://env.example', dir: dir() });
    keyFile({ apiKey: 'tm_file' }, 0o400);
    expect(settingsFrom({}, home.path).apiKey).toBe('tm_file');
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('say a file they may not open is unreadable, by kind', () => {
    keyFile({ apiKey: 'tm_file' }, 0o000);
    expect(settingsFrom({}, home.path).keyFileProblem).toBe('unreadable (Error:EACCES)');
  });

  it('pass over a file with a field there but empty or no string, rather than send the key to the default endpoint', () => {
    for (const endpoint of ['', '   ', null, 443, ['https://self.example']]) {
      keyFile({ apiKey: 'tm_file', endpoint });
      expect(settingsFrom({}, home.path)).toMatchObject({ apiKey: undefined, endpoint: undefined, keyFileProblem: 'endpoint empty or not a string' });
    }
    keyFile({ apiKey: '', endpoint: 'https://self.example' });
    expect(settingsFrom({ TELMONI_API_KEY: 'tm_env' }, home.path)).toMatchObject({ endpoint: undefined, keyFileProblem: 'apiKey empty or not a string' });
  });

  it('say by kind what is wrong with a file that is no key file', () => {
    keyFile('{"apiKey": ');
    expect(settingsFrom({}, home.path).keyFileProblem).toBe('not JSON');
    keyFile('["tm_file"]');
    expect(settingsFrom({}, home.path).keyFileProblem).toBe('not a JSON object');
    keyFile('x'.repeat(70_000));
    expect(settingsFrom({}, home.path).keyFileProblem).toBe('too large');
    expect(settingsFrom({}, join(home.path, 'none')).keyFileProblem).toBeUndefined();
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('pass over a file another user owns, which no chmod of the person’s mends', () => {
    mkdirSync(cursor(), { recursive: true });
    // Root's, and open to everyone: the owner is what is named.
    symlinkSync('/etc/passwd', join(cursor(), 'telmoni.json'));
    expect(settingsFrom({}, home.path).keyFileProblem).toBe('owned by another user');
  });

  it.skipIf(process.platform === 'win32')('never wait on a FIFO nothing writes to, nor read a folder', () => {
    mkdirSync(cursor(), { recursive: true });
    execFileSync('mkfifo', [join(cursor(), 'telmoni.json')]);
    expect(settingsFrom({}, home.path).keyFileProblem).toBe('not a file');
    rmSync(join(cursor(), 'telmoni.json'));
    mkdirSync(join(cursor(), 'telmoni.json'));
    expect(settingsFrom({}, home.path).keyFileProblem).toBe('not a file');
  });
});
