/**
 * Token auth: read token from TLVC_TOKEN_FILE, validate x-tlvc-token header.
 * Token is never logged.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';

const DEFAULT_TOKEN_FILE = '/Users/yzliu/work/tlvc/.secrets/tlvc.token';

export function getTokenFilePath(): string {
  return process.env.TLVC_TOKEN_FILE ?? DEFAULT_TOKEN_FILE;
}

export function readServerToken(): string {
  const path = getTokenFilePath();
  try {
    const raw = fs.readFileSync(path, 'utf-8');
    return raw.trim();
  } catch {
    return '';
  }
}

export async function authHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const serverToken = readServerToken();
  const clientToken = request.headers['x-tlvc-token'];
  const provided = typeof clientToken === 'string' ? clientToken.trim() : '';

  if (!serverToken || provided !== serverToken) {
    await reply.status(401).send({ ok: false, error: 'Unauthorized' });
  }
}
