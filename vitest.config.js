import {defineConfig} from 'vitest/config'
import {resolve} from 'path'

export default defineConfig({
  resolve: {
    alias: {
      $src: resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 800,
    hookTimeout: 1200,
    teardownTimeout: 1200,
    reporters: ['verbose'],
  },
})
