import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { 'telmoni-cursor-observability': 'src/cli.ts' },
  format: ['esm'],
  outExtension: () => ({ js: '.mjs' }),
  platform: 'node',
  target: 'node22',
  // The SDK and OpenTelemetry go inside: a global install runs no scripts
  // the package does not ship, and the hook finds nothing else at run time.
  noExternal: [/.*/],
  // Cursor waits on every hook, one per tool call among them, and evaluating
  // the SDK costs a hook about 70 ms: the sending code is imported only by the
  // detached copy, so it comes out as a chunk of its own that the hook never loads.
  splitting: true,
  clean: true,
});
