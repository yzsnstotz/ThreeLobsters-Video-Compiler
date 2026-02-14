/**
 * E2E: Step2 input file vs folder, deterministic output, and runtime error when messages.html missing.
 * Run from repo root: node tests/e2e-step2-input.test.mjs
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const fixtureFile = join(root, 'fixtures', 'telegram_export_dir', 'messages.html');
const fixtureDir = join(root, 'fixtures', 'telegram_export_dir');
const outBase = join(root, 'build', 'e2e-step2');
const outFile = join(outBase, 'by-file');
const outDir = join(outBase, 'by-dir');

function runCli(input, outDirPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['tlvc', 'preprocess', input, '--ep', 'ep_fixture', '--out', outDirPath, '--k', '2', '--tz', 'UTC'],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', reject);
  });
}

function readStep2Meta(outPath) {
  const transcriptPath = join(outPath, 'step2_preprocess', 'sanitized.transcript.json');
  const segmentsPath = join(outPath, 'step2_preprocess', 'segments.topk.json');
  if (!existsSync(transcriptPath) || !existsSync(segmentsPath)) return null;
  const transcript = JSON.parse(readFileSync(transcriptPath, 'utf-8'));
  const segments = JSON.parse(readFileSync(segmentsPath, 'utf-8'));
  return {
    meta: transcript.meta,
    messageCount: transcript.messages?.length ?? 0,
    segmentCount: segments.segments?.length ?? 0,
    firstSender: transcript.messages?.[0]?.sender,
    firstTs: transcript.messages?.[0]?.ts,
  };
}

async function main() {
  let failed = 0;

  // 1) Input file: fixtures/telegram_export_dir/messages.html
  if (!existsSync(fixtureFile)) {
    console.error('Missing fixture:', fixtureFile);
    process.exit(1);
  }
  rmSync(outFile, { recursive: true, force: true });
  mkdirSync(outFile, { recursive: true });
  const resFile = await runCli(fixtureFile, outFile);
  if (resFile.code !== 0 && resFile.code !== 2) {
    console.error('FAIL: file input should exit 0 or 2, got', resFile.code, resFile.stderr);
    failed++;
  }
  const metaFile = readStep2Meta(outFile);
  if (!metaFile) {
    console.error('FAIL: file input did not produce step2 output');
    failed++;
  } else {
    if (metaFile.firstSender === 'unknown') {
      console.error('FAIL: sender should not be unknown (profile should match Telegram DOM)');
      failed++;
    }
    if (!metaFile.firstTs || metaFile.firstTs.trim() === '') {
      console.error('FAIL: ts should not be empty (from title)');
      failed++;
    }
    if (metaFile.meta.input_kind !== 'file' || !metaFile.meta.export_root || !metaFile.meta.messages_html) {
      console.error('FAIL: meta should have input_kind, export_root, messages_html');
      failed++;
    }
  }

  // 2) Input dir: fixtures/telegram_export_dir/ → same output as file
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const resDir = await runCli(fixtureDir, outDir);
  if (resDir.code !== resFile.code) {
    console.error('FAIL: dir exit code should match file input, got', resDir.code, 'vs', resFile.code);
    failed++;
  }
  const metaDir = readStep2Meta(outDir);
  if (!metaDir) {
    console.error('FAIL: dir input did not produce step2 output');
    failed++;
  } else if (metaFile) {
    if (metaDir.messageCount !== metaFile.messageCount || metaDir.segmentCount !== metaFile.segmentCount) {
      console.error('FAIL: dir output should match file (messageCount/segmentCount)');
      failed++;
    }
    if (metaDir.meta.input_kind !== 'dir') {
      console.error('FAIL: dir input should set meta.input_kind=dir');
      failed++;
    }
  }

  // 3) Dir without messages.html → exit 1, no files written
  const badDir = join(outBase, 'no-html-dir');
  mkdirSync(badDir, { recursive: true });
  const resBad = await runCli(badDir, join(outBase, 'out-bad'));
  if (resBad.code !== 1) {
    console.error('FAIL: dir without messages.html should exit 1, got', resBad.code);
    failed++;
  }
  const badOut = join(outBase, 'out-bad', 'step2_preprocess', 'sanitized.transcript.json');
  if (existsSync(badOut)) {
    console.error('FAIL: should not write step2 files when input is invalid');
    failed++;
  }

  if (failed > 0) {
    console.error('E2E failed:', failed);
    process.exit(1);
  }
  console.log('E2E step2 input: OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
