/**
 * Step2 watch daemon: monitor inbox for new ep_#### directories, run Step2 CLI once per episode,
 * write step2.running / step2.done / step2.fail markers. No LLM, Node + fs only.
 */

import {
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  existsSync,
  appendFileSync,
  watch,
} from 'fs';
import { join, resolve } from 'path';
import { spawn } from 'child_process';

const EP_REGEX = /^ep_\d{4}$/;
const STAGING_SUFFIX = '.__staging__';

export interface WatchStep2Options {
  /** Repo root (cwd). */
  repoRoot: string;
  /** Inbox directory relative to repo root, default "inbox". */
  inboxDir?: string;
  /** Poll interval in ms when not using fs.watch or as fallback. Default 5000. */
  pollIntervalMs?: number;
  /** Default timezone for Step2. Default "Asia/Tokyo". */
  tz?: string;
  /** Default k for Step2. Default 3. */
  kDefault?: number;
  /** Step2 run timeout in ms. Default 600000 (10 min). */
  runTimeoutMs?: number;
  /** Stability: wait this many ms without mtime/file-count change before considering dir ready. Default 2000. */
  stabilityMs?: number;
}

interface RunningMarker {
  start_ts: string;
  pid: number;
}

interface DoneMarker {
  end_ts: string;
  exit_code: number;
  output_dir: string;
}

interface FailMarker {
  end_ts: string;
  exit_code: number;
  reason: string;
  lint_summary_path?: string;
}

function logToFile(ep: string, repoRoot: string, line: string): void {
  const logDir = join(repoRoot, 'build', 'episodes', ep, 'logs');
  const logPath = join(logDir, 'step2_watch.log');
  try {
    mkdirSync(logDir, { recursive: true });
    const content = line.endsWith('\n') ? line : line + '\n';
    appendFileSync(logPath, content, 'utf-8');
  } catch {
    // best effort
  }
}

function log(ep: string, repoRoot: string, message: string, alsoConsole = true): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${message}`;
  logToFile(ep, repoRoot, line);
  if (alsoConsole) console.log(`[${ep}] ${message}`);
}

function getInboxPath(repoRoot: string, inboxDir: string): string {
  return resolve(repoRoot, inboxDir);
}

function listEpisodeDirs(inboxPath: string): string[] {
  try {
    const entries = readdirSync(inboxPath, { withFileTypes: true });
    return entries
      .filter((d) => d.isDirectory() && EP_REGEX.test(d.name) && !d.name.endsWith(STAGING_SUFFIX))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/** Check that directory has a valid entry (messages.html or locatable HTML). Step2 accepts dir, so we only need existence of messages.html or any .html. */
function isDeliveryComplete(dirPath: string): boolean {
  try {
    if (existsSync(join(dirPath, 'messages.html'))) return true;
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const hasHtml = entries.some((d) => d.isFile() && d.name.toLowerCase().endsWith('.html'));
    return hasHtml;
  } catch {
    return false;
  }
}

function dirStats(dirPath: string): { mtimeMs: number; fileCount: number } {
  try {
    const stat = statSync(dirPath);
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const fileCount = entries.filter((e) => e.isFile()).length;
    return { mtimeMs: stat.mtimeMs, fileCount };
  } catch {
    return { mtimeMs: 0, fileCount: -1 };
  }
}

function markerPath(repoRoot: string, ep: string, name: 'step2.running' | 'step2.done' | 'step2.fail'): string {
  return join(repoRoot, 'build', 'episodes', ep, name);
}

function hasDone(repoRoot: string, ep: string): boolean {
  return existsSync(markerPath(repoRoot, ep, 'step2.done'));
}

function hasFail(repoRoot: string, ep: string): boolean {
  return existsSync(markerPath(repoRoot, ep, 'step2.fail'));
}

const RUNNING_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

function getRunningMarker(repoRoot: string, ep: string): RunningMarker | null {
  const p = markerPath(repoRoot, ep, 'step2.running');
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, 'utf-8');
    return JSON.parse(raw) as RunningMarker;
  } catch {
    return null;
  }
}

function isRunningStale(repoRoot: string, ep: string, timeoutMs: number): boolean {
  const m = getRunningMarker(repoRoot, ep);
  if (!m) return false;
  const start = new Date(m.start_ts).getTime();
  return Date.now() - start > timeoutMs;
}

function shouldProcess(repoRoot: string, ep: string, runTimeoutMs: number): boolean {
  if (hasDone(repoRoot, ep)) return false;
  if (hasFail(repoRoot, ep)) return false;
  if (existsSync(markerPath(repoRoot, ep, 'step2.running'))) {
    if (isRunningStale(repoRoot, ep, runTimeoutMs)) return true; // will be handled as timeout fail
    return false; // still running
  }
  return true;
}

function writeRunning(repoRoot: string, ep: string, pid: number): void {
  const dir = join(repoRoot, 'build', 'episodes', ep);
  mkdirSync(dir, { recursive: true });
  const p = markerPath(repoRoot, ep, 'step2.running');
  const data: RunningMarker = { start_ts: new Date().toISOString(), pid };
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

function writeDone(repoRoot: string, ep: string, outputDir: string): void {
  const p = markerPath(repoRoot, ep, 'step2.done');
  const data: DoneMarker = {
    end_ts: new Date().toISOString(),
    exit_code: 0,
    output_dir: outputDir,
  };
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

function writeFail(repoRoot: string, ep: string, exitCode: number, reason: string, lintSummaryPath?: string): void {
  const dir = join(repoRoot, 'build', 'episodes', ep);
  mkdirSync(dir, { recursive: true });
  const p = markerPath(repoRoot, ep, 'step2.fail');
  const data: FailMarker = {
    end_ts: new Date().toISOString(),
    exit_code: exitCode,
    reason,
    ...(lintSummaryPath != null && lintSummaryPath !== '' ? { lint_summary_path: lintSummaryPath } : {}),
  };
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

function removeRunning(repoRoot: string, ep: string): void {
  const p = markerPath(repoRoot, ep, 'step2.running');
  if (existsSync(p)) {
    try {
      unlinkSync(p);
    } catch {
      // ignore
    }
  }
}

function runStep2(
  repoRoot: string,
  inputPath: string,
  ep: string,
  k: number,
  tz: string,
  timeoutMs: number
): Promise<{ exitCode: number; timedOut: boolean }> {
  return new Promise((resolvePromise) => {
    const outDir = join(repoRoot, 'build', 'episodes', ep);
    const args = [
      'tlvc',
      '--',
      'preprocess',
      inputPath,
      '--ep',
      ep,
      '--out',
      outDir,
      '--k',
      String(k),
      '--tz',
      tz,
    ];
    const child = spawn('pnpm', args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let timedOut = false;
    const t = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        //
      }
      resolvePromise({ exitCode: 1, timedOut: true });
    }, timeoutMs);

    child.on('error', () => {
      clearTimeout(t);
      resolvePromise({ exitCode: 1, timedOut: false });
    });

    child.on('close', (code, signal) => {
      clearTimeout(t);
      if (timedOut) return;
      const exitCode = code ?? (signal ? 1 : 0);
      resolvePromise({ exitCode, timedOut: false });
    });
  });
}

async function processOne(
  repoRoot: string,
  inboxPath: string,
  ep: string,
  opts: Required<WatchStep2Options>,
  runTimeoutMs: number
): Promise<void> {
  const inputPath = join(inboxPath, ep);

  if (!isDeliveryComplete(inputPath)) {
    log(ep, repoRoot, 'Skip: no messages.html or .html in directory');
    return;
  }

  const buildEpDir = join(repoRoot, 'build', 'episodes', ep);
  mkdirSync(buildEpDir, { recursive: true });

  writeRunning(repoRoot, ep, process.pid);
  log(ep, repoRoot, 'Step2 started (pid ' + process.pid + ')');

  try {
    const { exitCode, timedOut } = await runStep2(
      repoRoot,
      inputPath,
      ep,
      opts.kDefault,
      opts.tz,
      runTimeoutMs
    );

    removeRunning(repoRoot, ep);

    const outputDir = join(buildEpDir, 'step2_preprocess');
    const lintPath = join(outputDir, 'lint_report.step2.json');

    if (exitCode === 0) {
      writeDone(repoRoot, ep, outputDir);
      log(ep, repoRoot, 'Step2 done (exit 0) -> step2.done');
    } else {
      const reason = timedOut
        ? 'Step2 run timed out'
        : `Step2 exit code ${exitCode} (lint fail or error)`;
      writeFail(
        repoRoot,
        ep,
        exitCode,
        reason,
        existsSync(lintPath) ? lintPath : undefined
      );
      log(ep, repoRoot, `Step2 fail: ${reason} -> step2.fail`);
    }
  } catch (err) {
    removeRunning(repoRoot, ep);
    const reason = err instanceof Error ? err.message : String(err);
    writeFail(repoRoot, ep, 1, `Exception: ${reason}`);
    log(ep, repoRoot, `Step2 fail (exception): ${reason} -> step2.fail`);
  }
}

async function waitStable(
  dirPath: string,
  stabilityMs: number
): Promise<boolean> {
  const a = dirStats(dirPath);
  await new Promise((r) => setTimeout(r, stabilityMs));
  const b = dirStats(dirPath);
  return a.mtimeMs === b.mtimeMs && a.fileCount === b.fileCount && a.fileCount >= 0;
}

const processQueue: string[] = [];
let processing = false;

async function drainQueue(
  repoRoot: string,
  inboxPath: string,
  opts: Required<WatchStep2Options>,
  runTimeoutMs: number
): Promise<void> {
  if (processing || processQueue.length === 0) return;
  processing = true;
  while (processQueue.length > 0) {
    const ep = processQueue.shift()!;
    if (!shouldProcess(repoRoot, ep, runTimeoutMs)) continue;
    if (isRunningStale(repoRoot, ep, runTimeoutMs)) {
      removeRunning(repoRoot, ep);
      writeFail(repoRoot, ep, 1, 'Step2 run timed out (stale step2.running)');
      log(ep, repoRoot, 'Marked fail: stale step2.running');
      continue;
    }
    const inputPath = join(inboxPath, ep);
    const stable = await waitStable(inputPath, opts.stabilityMs);
    if (!stable) {
      log(ep, repoRoot, 'Skip: directory not stable after ' + opts.stabilityMs + 'ms');
      continue;
    }
    await processOne(repoRoot, inboxPath, ep, opts, runTimeoutMs);
  }
  processing = false;
}

function enqueue(ep: string): void {
  if (processQueue.includes(ep)) return;
  processQueue.push(ep);
}

function scanAndEnqueue(repoRoot: string, inboxPath: string, runTimeoutMs: number): void {
  const eps = listEpisodeDirs(inboxPath);
  for (const ep of eps) {
    if (shouldProcess(repoRoot, ep, runTimeoutMs)) enqueue(ep);
  }
}

export function runWatchStep2(options: WatchStep2Options): void {
  const repoRoot = resolve(options.repoRoot);
  const inboxDir = options.inboxDir ?? 'inbox';
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  const tz = options.tz ?? 'Asia/Tokyo';
  const kDefault = options.kDefault ?? 3;
  const runTimeoutMs = options.runTimeoutMs ?? 600000;
  const stabilityMs = options.stabilityMs ?? 2000;

  const opts: Required<WatchStep2Options> = {
    repoRoot,
    inboxDir,
    pollIntervalMs,
    tz,
    kDefault,
    runTimeoutMs,
    stabilityMs,
  };

  const inboxPath = getInboxPath(repoRoot, inboxDir);

  if (!existsSync(inboxPath)) {
    console.error('Inbox not found:', inboxPath);
    process.exit(1);
  }

  console.log('Watch Step2: inbox=' + inboxPath + ' poll=' + pollIntervalMs + 'ms k=' + kDefault + ' tz=' + tz);

  let watchFailed = false;

  try {
    watch(inboxPath, { recursive: false }, (event: string, filename: string | null) => {
      if (filename && EP_REGEX.test(filename) && !filename.endsWith(STAGING_SUFFIX)) {
        enqueue(filename);
        void drainQueue(repoRoot, inboxPath, opts, runTimeoutMs);
      }
    });
  } catch {
    watchFailed = true;
    console.log('fs.watch unavailable, using polling only');
  }

  const poll = () => {
    scanAndEnqueue(repoRoot, inboxPath, runTimeoutMs);
    drainQueue(repoRoot, inboxPath, opts, runTimeoutMs);
  };

  poll();
  const interval = setInterval(poll, pollIntervalMs);

  process.on('SIGINT', () => {
    clearInterval(interval);
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    clearInterval(interval);
    process.exit(0);
  });
}

function parseArgs(): { inbox: string; poll: number; k: number; tz: string } {
  const argv = process.argv.slice(2);
  let inbox = 'inbox';
  let poll = 5000;
  let k = 3;
  let tz = 'Asia/Tokyo';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--inbox' && argv[i + 1]) {
      inbox = argv[++i];
    } else if (argv[i] === '--poll' && argv[i + 1]) {
      poll = parseInt(argv[++i], 10) || 5000;
    } else if (argv[i] === '--k' && argv[i + 1]) {
      k = parseInt(argv[++i], 10) || 3;
    } else if (argv[i] === '--tz' && argv[i + 1]) {
      tz = argv[++i];
    }
  }
  return { inbox, poll, k, tz };
}

export function main(): void {
  const cwd = process.cwd();
  const { inbox, poll, k, tz } = parseArgs();
  runWatchStep2({
    repoRoot: cwd,
    inboxDir: inbox,
    pollIntervalMs: poll,
    tz,
    kDefault: k,
    runTimeoutMs: 600000,
    stabilityMs: 2000,
  });
}

// Run only when this file is the entry script (pnpm watch:step2).
if (process.argv[1]?.includes('watch_step2')) {
  main();
}
