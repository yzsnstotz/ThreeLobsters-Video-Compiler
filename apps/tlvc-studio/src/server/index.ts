/**
 * TLVC Studio: single-port Express + Vite (dev) or static (prod).
 * Listen on 0.0.0.0 for LAN/Tailscale access. Port from TLVC_STUDIO_PORT (default 4173).
 */

import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, '..', '..');
const isDev = process.env.NODE_ENV !== 'production';
const PORT = Number(process.env.TLVC_STUDIO_PORT) || 4173;

async function main() {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', apiRouter);

  if (isDev) {
    const vite = await createViteServer({
      root: appRoot,
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const clientDir = join(appRoot, 'dist', 'client');
    app.use(express.static(clientDir));
    app.get('*', (_req, res) => {
      res.sendFile(join(clientDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TLVC Studio at http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
