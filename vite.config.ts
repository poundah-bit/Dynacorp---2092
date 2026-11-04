import { defineConfig } from 'vitest/config';

// base: relative paths so the build works under GitHub Pages (/<repo>/).
export default defineConfig({
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
