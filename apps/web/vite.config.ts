import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Production Content-Security-Policy (Architecture §18.1, NFR-PRIV-01).
 * Injected only into the built HTML: Vite's dev server needs inline scripts for HMR.
 * Increment 1 has no optional services, so connect-src is 'self' only (DEC-016).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'bpmap-csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
});

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), cspPlugin()],
  worker: { format: 'es' },
  // Export libraries are imported lazily (DEC-044). Pre-bundle them at dev-server start so the
  // first export doesn't trigger a mid-session re-optimisation, which invalidates already-loaded
  // modules ("Failed to fetch dynamically imported module", DEC-048).
  optimizeDeps: { include: ['jspdf', 'svg2pdf.js', 'pptxgenjs', 'fflate'] },
  build: { target: 'es2022', sourcemap: true },
});
