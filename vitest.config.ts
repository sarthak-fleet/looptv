import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Plain Vitest config (formerly @saas-maker/test-config/vitest factory).
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts', 'scripts/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.next', '.wrangler', 'out'],
    testTimeout: 15_000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
