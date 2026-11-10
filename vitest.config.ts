import { defineConfig } from 'vitest/config';

// Unit + golden-file tests for the framework-free packages (Architecture §21).
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
