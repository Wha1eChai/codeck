import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/__verify__/**/*.test.ts'],
    testTimeout: 30_000,
  },
})
