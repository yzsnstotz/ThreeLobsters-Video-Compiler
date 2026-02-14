/**
 * POST /v1/episodes/:ep/deliver — two-phase commit: unzip to staging, then rename to inbox/ep_####.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import AdmZip from 'adm-zip';
import * as path from 'path';
import { fs, validateEp, isSafeZipEntryName, findLargestHtml } from './util/fs';

const DEFAULT_ROOT = '/Users/yzliu/work/tlvc';

function getRoot(): string {
  return process.env.TLVC_ROOT ?? DEFAULT_ROOT;
}

interface DeliverParams {
  ep: string;
}

export async function registerDeliver(app: FastifyInstance): Promise<void> {
  app.post<{ Params: DeliverParams }>(
    '/v1/episodes/:ep/deliver',
    async (request: FastifyRequest<{ Params: DeliverParams }>, reply: FastifyReply) => {
      const { ep } = request.params;
      if (!validateEp(ep)) {
        return reply.status(400).send({ ok: false, error: 'Invalid ep; must match ^ep_[0-9]{4}$' });
      }

      const root = getRoot();
      const inboxDir = path.join(root, 'inbox');
      const stagingName = `${ep}.__staging__.${Math.floor(Date.now() / 1000)}`;
      const staging = path.join(inboxDir, stagingName);
      const commitDir = path.join(inboxDir, ep);

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ ok: false, error: 'Missing file (multipart file field required)' });
      }

      const buffer = await data.toBuffer();
      let zip: AdmZip;
      try {
        zip = new AdmZip(buffer);
      } catch (e) {
        return reply.status(400).send({ ok: false, error: 'Invalid zip file' });
      }

      await fs.ensureDir(staging);

      try {
        const entries = zip.getEntries();
        for (const entry of entries) {
          if (entry.isDirectory) continue;
          const name = entry.entryName.replace(/\\/g, '/');
          if (!isSafeZipEntryName(name)) {
            await fs.remove(staging);
            return reply.status(400).send({ ok: false, error: 'Zip contains invalid path (path traversal)' });
          }
          zip.extractEntryTo(entry, staging, true, true);
        }
      } catch (e) {
        await fs.remove(staging).catch(() => {});
        return reply.status(500).send({ ok: false, error: 'Failed to extract zip' });
      }

      // Prefer messages.html at root, else largest .html in staging
      const rootHtml = path.join(staging, 'messages.html');
      let htmlPath: string;
      if (await fs.pathExists(rootHtml)) {
        htmlPath = rootHtml;
      } else {
        const largest = await findLargestHtml(staging);
        if (!largest) {
          await fs.remove(staging);
          return reply.status(422).send({ ok: false, error: 'No HTML file found in zip' });
        }
        await fs.copy(largest.path, rootHtml, { overwrite: true });
        htmlPath = rootHtml;
      }

      if (await fs.pathExists(commitDir)) {
        await fs.remove(staging);
        return reply.status(200).send({
          ok: true,
          already_exists: true,
          ep,
          inbox_dir: commitDir,
        });
      }

      try {
        await fs.rename(staging, commitDir);
      } catch (e) {
        await fs.remove(staging).catch(() => {});
        return reply.status(500).send({ ok: false, error: 'Failed to commit directory' });
      }

      const messagesHtml = path.join(commitDir, 'messages.html');
      return reply.status(200).send({
        ok: true,
        already_exists: false,
        ep,
        inbox_dir: commitDir,
        html: messagesHtml,
      });
    }
  );
}
