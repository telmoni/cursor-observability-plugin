import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // One file at a time: the hook's suite times processes, which the other suites' work would starve.
    fileParallelism: false,
  },
});
