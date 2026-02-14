/**
 * GET /v1/episodes/:ep/status — status from step2 markers + artifacts.
 * GET /v1/episodes/:ep/artifacts — optional: return three JSON file contents.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as path from 'path';
import { fs, validateEp } from './util/fs';

const DEFAULT_ROOT = '/Users/yzliu/work/tlvc';

function getRoot(): string {
  return process.env.TLVC_ROOT ?? DEFAULT_ROOT;
}

function outDir(root: string, ep: string): string {
  return path.join(root, 'build', 'episodes', ep);
}

function step2PreprocessDir(root: string, ep: string): string {
  return path.join(outDir(root, ep), 'step2_preprocess');
}

type StatusKind = 'done' | 'running' | 'fail' | 'unknown';

interface StatusParams {
  ep: string;
}

export async function registerStatus(app: FastifyInstance): Promise<void> {
  app.get<{ Params: StatusParams }>(
    '/v1/episodes/:ep/status',
    async (request: FastifyRequest<{ Params: StatusParams }>, reply: FastifyReply) => {
      const { ep } = request.params;
      if (!validateEp(ep)) {
        return reply.status(400).send({ ok: false, error: 'Invalid ep; must match ^ep_[0-9]{4}$' });
      }

      const root = getRoot();
      const out = outDir(root, ep);
      const step2Dir = step2PreprocessDir(root, ep);

      const donePath = path.join(out, 'step2.done');
      const failPath = path.join(out, 'step2.fail');
      const runningPath = path.join(out, 'step2.running');

      let status: StatusKind = 'unknown';
      if (await fs.pathExists(donePath)) {
        status = 'done';
      } else if (await fs.pathExists(failPath)) {
        status = 'fail';
      } else if (await fs.pathExists(runningPath)) {
        status = 'running';
      }

      const sanitizedPath = path.join(step2Dir, 'sanitized.transcript.json');
      const topkPath = path.join(step2Dir, 'segments.topk.json');
      const lintPath = path.join(step2Dir, 'lint_report.step2.json');

      const artifacts = {
        sanitized: await fs.pathExists(sanitizedPath),
        topk: await fs.pathExists(topkPath),
        lint: await fs.pathExists(lintPath),
      };

      return reply.status(200).send({
        ok: true,
        ep,
        status,
        out_dir: out,
        artifacts,
      });
    }
  );

  app.get<{ Params: StatusParams }>(
    '/v1/episodes/:ep/artifacts',
    async (request: FastifyRequest<{ Params: StatusParams }>, reply: FastifyReply) => {
      const { ep } = request.params;
      if (!validateEp(ep)) {
        return reply.status(400).send({ ok: false, error: 'Invalid ep; must match ^ep_[0-9]{4}$' });
      }

      const root = getRoot();
      const step2Dir = step2PreprocessDir(root, ep);
      const sanitizedPath = path.join(step2Dir, 'sanitized.transcript.json');
      const topkPath = path.join(step2Dir, 'segments.topk.json');
      const lintPath = path.join(step2Dir, 'lint_report.step2.json');

      const exists = {
        sanitized: await fs.pathExists(sanitizedPath),
        topk: await fs.pathExists(topkPath),
        lint: await fs.pathExists(lintPath),
      };

      if (!exists.sanitized && !exists.topk && !exists.lint) {
        return reply.status(404).send({ ok: false, error: 'No artifacts found for this episode' });
      }

      const result: Record<string, unknown> = {};
      try {
        if (exists.sanitized) {
          result.sanitized_transcript = JSON.parse(await fs.readFile(sanitizedPath, 'utf-8'));
        }
        if (exists.topk) {
          result.segments_topk = JSON.parse(await fs.readFile(topkPath, 'utf-8'));
        }
        if (exists.lint) {
          result.lint_report = JSON.parse(await fs.readFile(lintPath, 'utf-8'));
        }
      } catch (e) {
        return reply.status(422).send({ ok: false, error: 'Failed to read or parse artifact JSON' });
      }

      return reply.status(200).send({
        ok: true,
        ep,
        ...result,
      });
    }
  );
}
