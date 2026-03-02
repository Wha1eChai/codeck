import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'out', 'dist', 'src/**/__integration__/**'],
  },
  resolve: {
    alias: {
      '@common': resolve(__dirname, 'src/common'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      // Resolve workspace package from TypeScript source so tests work
      // without a prior build step (both locally and in CI).
      '@codeck/config': resolve(__dirname, '../packages/config/src/index.ts'),
      // Global Electron mock — prevents binary-path resolution failures in CI.
      'electron': resolve(__dirname, 'src/__mocks__/electron.ts'),
    },
  },
})
