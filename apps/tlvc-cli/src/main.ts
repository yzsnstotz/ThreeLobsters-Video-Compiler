/**
 * CLI: tlvc preprocess <input> --ep ep_0007 --out build/episodes/ep_0007 --k 3 [--tz Asia/Tokyo] [--profile path]
 * <input> = path to messages.html OR Telegram export folder (containing messages.html).
 * Required: --ep, --out, --k. Missing => usage + exit(1). Runtime error => exit(1), no files written.
 * If --profile omitted, uses default from profiles/extractors/index.json else telegram_export_v1.json.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { preprocessEpisode } from 'tlvc-preprocessor';

function getDefaultProfilePath(): string {
  const indexPath = join(process.cwd(), 'profiles', 'extractors', 'index.json');
  if (existsSync(indexPath)) {
    try {
      const raw = readFileSync(indexPath, 'utf-8');
      const index = JSON.parse(raw) as { defaultProfile?: string };
      if (index.defaultProfile) {
        return join('profiles', 'extractors', index.defaultProfile);
      }
    } catch {
      /* fallback */
    }
  }
  return 'profiles/extractors/telegram_export_v1.json';
}

const USAGE = `Usage: tlvc preprocess <input> --ep <ep_id> --out <out_dir> --k <k> [--tz <tz>] [--profile <path>]

  <input>  Path to messages.html OR Telegram export folder (must contain messages.html)

Required:
  --ep     Episode ID (e.g. ep_0007)
  --out    Output directory (e.g. build/episodes/ep_0007). Writes to <out_dir>/step2_preprocess/
  --k      Top-K segments count (e.g. 3)

Optional:
  --tz     Timezone (default: Asia/Tokyo)
  --profile Path or name of extractor profile (default: profiles/extractors/telegram_export_v1.json)
`;

function parseArgs(): {
  input: string;
  ep: string;
  out: string;
  k: number;
  tz: string;
  profile?: string;
} | null {
  const argv = process.argv.slice(2);
  const args: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--ep' && argv[i + 1]) {
      args.ep = argv[++i];
    } else if (arg === '--out' && argv[i + 1]) {
      args.out = argv[++i];
    } else if (arg === '--k' && argv[i + 1]) {
      args.k = argv[++i];
    } else if (arg === '--tz' && argv[i + 1]) {
      args.tz = argv[++i];
    } else if (arg === '--profile' && argv[i + 1]) {
      args.profile = argv[++i];
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }
  if (!args.ep || !args.out || args.k === undefined) return null;
  const k = parseInt(args.k, 10);
  if (Number.isNaN(k) || k < 1) return null;
  const cmd = positional[0];
  const input = positional[1];
  if (cmd !== 'preprocess' || !input) return null;
  return {
    input,
    ep: args.ep,
    out: args.out,
    k,
    tz: args.tz ?? 'Asia/Tokyo',
    profile: args.profile,
  };
}

async function main(): Promise<void> {
  const parsed = parseArgs();
  if (!parsed) {
    console.error(USAGE);
    process.exit(1);
  }

  try {
    const profilePath = parsed.profile ?? getDefaultProfilePath();
    const result = await preprocessEpisode({
      input: parsed.input,
      epId: parsed.ep,
      outDir: parsed.out,
      k: parsed.k,
      tz: parsed.tz,
      profilePath,
    });
    process.exit(result.exitCode);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
