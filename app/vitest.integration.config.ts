import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__integration__/**/*.test.ts'],
    exclude: ['node_modules', 'out', 'dist'],
    testTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@common': resolve(__dirname, 'src/common'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@codeck/config': resolve(__dirname, '../packages/config/src/index.ts'),
      '@codeck/provider': resolve(__dirname, '../packages/provider/src/index.ts'),
      '@codeck/agent-core': resolve(__dirname, '../packages/agent-core/src/index.ts'),
      'electron': resolve(__dirname, 'src/__mocks__/electron.ts'),
    },
  },
})
