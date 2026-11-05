import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// base: relative paths so the build works under GitHub Pages (/<repo>/).
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { game: page('./index.html'), observe: page('./observe.html') },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
