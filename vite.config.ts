import { defineConfig } from 'vite';

/**
 * GitHub Pages serves this project site at /fourseasion/.
 * An absolute base keeps JS, CSS, and font URLs rooted there even when the
 * document URL has no trailing slash. Set VITE_BASE to publish under another
 * path (include the leading and trailing slash).
 */
function pagesBase(): string {
  const raw = process.env.VITE_BASE ?? '/fourseasion/';
  const withLead = raw.startsWith('/') ? raw : `/${raw}`;
  return withLead.endsWith('/') ? withLead : `${withLead}/`;
}

export default defineConfig({
  base: pagesBase(),
  publicDir: 'public',
  server: {
    host: '0.0.0.0',
    port: 47321,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 47321,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
});
