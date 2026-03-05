import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@codeck/provider': resolve(__dirname, '../provider/src/index.ts'),
    },
  },
})
