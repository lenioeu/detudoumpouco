import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://promozap.app',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
});
