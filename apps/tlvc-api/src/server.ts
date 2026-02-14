/**
 * TLVC API server: deliver (POST) and status/artifacts (GET).
 * Auth via x-tlvc-token; config via env (TLVC_ROOT, TLVC_TOKEN_FILE, TLVC_PORT, etc.).
 */

import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { authHook } from './auth';
import { registerDeliver } from './deliver';
import { registerStatus } from './status';

const DEFAULT_PORT = 8789;
const DEFAULT_BIND = '0.0.0.0';
const DEFAULT_MAX_UPLOAD_MB = 200;

function getPort(): number {
  const p = process.env.TLVC_PORT;
  if (p == null || p === '') return DEFAULT_PORT;
  const n = parseInt(p, 10);
  return Number.isFinite(n) ? n : DEFAULT_PORT;
}

function getBind(): string {
  return process.env.TLVC_BIND ?? DEFAULT_BIND;
}

function getMaxUploadBytes(): number {
  const mb = process.env.TLVC_MAX_UPLOAD_MB;
  if (mb == null || mb === '') return DEFAULT_MAX_UPLOAD_MB * 1024 * 1024;
  const n = parseInt(mb, 10);
  const value = Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_UPLOAD_MB;
  return value * 1024 * 1024;
}

async function main(): Promise<void> {
  const app = Fastify({
    logger: {
      level: 'info',
      serializers: {
        req(request: { method: string; url: string; headers: Record<string, string | undefined> }) {
          const headers = { ...request.headers };
          if (headers['x-tlvc-token']) headers['x-tlvc-token'] = '[REDACTED]';
          return { method: request.method, url: request.url, headers };
        },
      },
    },
    disableRequestLogging: false,
    requestIdLogLabel: 'reqId',
  });

  await app.register(helmet, { global: true });
  await app.register(multipart, {
    limits: {
      fileSize: getMaxUploadBytes(),
    },
  });

  app.addHook('preHandler', authHook);

  await registerDeliver(app);
  await registerStatus(app);

  const port = getPort();
  const host = getBind();
  await app.listen({ port, host });
  console.log(`tlvc-api listening on ${host}:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
