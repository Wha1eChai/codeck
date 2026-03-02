import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/__verify__/**'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/__verify__/**', 'src/**/index.ts'],
    },
  },
})
