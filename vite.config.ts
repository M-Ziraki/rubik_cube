import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The Jev endpoint, mounted in the dev server.
 *
 * `npm run dev` then behaves exactly like production: the browser posts to
 * `/api/jev/*`, the key stays in this Node process, and nothing about the
 * integration is a special case that only works in one of the two.
 *
 * Imported lazily so that a developer without the SDK installed, or without a
 * key, still gets a working dev server.
 */
function jevEndpoint(): Plugin {
  return {
    name: 'cube-atlas-jev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/jev/')) { next(); return; }
        void import('./server/transport')
          .then(({ serveJev }) => serveJev(req, res))
          .then((handled) => { if (!handled) next(); })
          .catch((err: Error) => {
            server.config.logger.error(`[jev] ${err.message}`);
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'server' }));
          });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), jevEndpoint()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
} as any);
