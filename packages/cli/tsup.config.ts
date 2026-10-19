import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  clean: true,
  outDir: 'bin',
  target: 'node20',
  noExternal: ['@promptcheck/shared'],
});
