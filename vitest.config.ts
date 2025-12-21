import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.next/',
        'dist/',
        '**/*.config.{js,ts}',
        '**/*.d.ts',
        '**/__tests__/**',
      ],
    },
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      'node_modules',
      'cli/**',
      '.next',
      'dist',
      '__tests__/api/chat.test.ts', // Old Jest test - needs conversion
      '__tests__/sdk/javascript.test.ts', // Old Jest test - needs conversion
      '__tests__/integration/e2e.test.ts', // Old - use __tests__/e2e/ instead
      '__tests__/e2e/**', // Playwright E2E tests - run via playwright test command
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
