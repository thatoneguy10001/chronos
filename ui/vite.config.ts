import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';

// Dev-only middleware: the wasm-pack output is fetched at a stable URL
// (/src/wasm/chronos_wasm_bg.wasm), so the browser's HTTP cache will happily
// serve a stale binary across rebuilds. Force no-store on the wasm assets so a
// plain reload always picks up the freshly built engine.
function noCacheWasm() {
  return {
    name: 'no-cache-wasm',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url && req.url.includes('/wasm/')) {
          res.setHeader('Cache-Control', 'no-store, must-revalidate');
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait(), noCacheWasm()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  optimizeDeps: {
    // WASM modules must be excluded from Vite's pre-bundling
    exclude: ['chronos-wasm'],
  },
});
