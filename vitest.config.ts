import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Vitest runs the main-process data layer (FileService, atomic writes, path
 * helpers) against real temp directories in a Node environment. No Electron,
 * no jsdom — these modules are pure Node + shared types by design.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false
  }
})
