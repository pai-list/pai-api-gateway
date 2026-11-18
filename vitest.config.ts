import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    environment: 'node',
    globals: true,
    include: ['workers/subdomain-redirect/src/**/*.test.ts'],
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
});
