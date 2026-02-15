/**
 * Step2 doctor: check input, profile, sample message stats, trigger counts.
 * Exit 0 unless input missing or parse crash. No build output.
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import type { TranscriptMessage } from 'tlvc-schema';
import { resolveTelegramExportInput } from './input_resolver';
import { parseAndAssignIds } from './html_parser';
import { matchTriggers } from 'tlvc-rules';

const SAMPLE_N = 20;

function getDefaultProfilePath(): string {
  const indexPath = resolve(process.cwd(), 'profiles', 'extractors', 'index.json');
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

export interface DoctorStep2Options {
  input: string;
  ep: string;
  profilePath?: string;
}

export interface DoctorStep2Result {
  ok: true;
  input_path: string;
  messages_html: string;
  profile_name: string;
  profile_version: number;
  total_messages: number;
  sample: {
    container_matches: number;
    ts_missing_count: number;
    sender_unknown_count: number;
    empty_text_count: number;
  };
  trigger_stats: { error: number; permission: number; action: number };
  conclusion: 'error' | 'fallback';
  conclusion_reason: string;
}

export async function runDoctorStep2(options: DoctorStep2Options): Promise<DoctorStep2Result> {
  const { input, ep, profilePath: profilePathOpt } = options;
  const resolved = await resolveTelegramExportInput(input);
  const profilePath = profilePathOpt ?? getDefaultProfilePath();
  let profileName = profilePath;
  let profileVersion = 1;
  try {
    const raw = readFileSync(resolve(process.cwd(), profilePath), 'utf-8');
    const profile = JSON.parse(raw) as { meta?: { name?: string; version?: number } };
    if (profile.meta?.name) profileName = profile.meta.name;
    if (profile.meta?.version != null) profileVersion = profile.meta.version;
  } catch {
    /* use path and 1 */
  }

  const messages = parseAndAssignIds(
    resolved.messagesHtmlPath,
    profilePath,
    'Asia/Tokyo',
    resolved.exportRootDir
  );
  const total = messages.length;

  const sampleSlice = messages.slice(0, SAMPLE_N);
  let tsMissing = 0;
  let senderUnknown = 0;
  let emptyText = 0;
  for (const m of sampleSlice) {
    if (!m.ts_raw || m.ts_raw.trim() === '') tsMissing += 1;
    if (m.sender === 'unknown') senderUnknown += 1;
    if (!m.text || m.text.trim() === '') emptyText += 1;
  }

  const trigger_stats = { error: 0, permission: 0, action: 0 };
  for (const m of messages) {
    for (const hit of matchTriggers(m.text)) {
      if (hit.category === 'error') trigger_stats.error += 1;
      else if (hit.category === 'permission') trigger_stats.permission += 1;
      else if (hit.category === 'action') trigger_stats.action += 1;
    }
  }

  const useFallback = trigger_stats.error === 0;
  return {
    ok: true,
    input_path: resolved.input_path,
    messages_html: resolved.messagesHtmlPath,
    profile_name: profileName,
    profile_version: profileVersion,
    total_messages: total,
    sample: {
      container_matches: sampleSlice.length,
      ts_missing_count: tsMissing,
      sender_unknown_count: senderUnknown,
      empty_text_count: emptyText,
    },
    trigger_stats,
    conclusion: useFallback ? 'fallback' : 'error',
    conclusion_reason: useFallback
      ? `将使用 fallback 切段（原因：error hits=0）`
      : '将使用 error 切段',
  };
}

export function printDoctorStep2(result: DoctorStep2Result): void {
  console.log('--- Step2 Doctor ---');
  console.log('input_path:', result.input_path);
  console.log('messages_html:', result.messages_html);
  console.log('profile:', result.profile_name, 'version', result.profile_version);
  console.log('total_messages:', result.total_messages);
  console.log('sample (first ' + SAMPLE_N + '):');
  console.log('  container_matches:', result.sample.container_matches);
  console.log('  ts_missing_count:', result.sample.ts_missing_count);
  console.log('  sender_unknown_count:', result.sample.sender_unknown_count);
  console.log('  empty_text_count:', result.sample.empty_text_count);
  console.log('trigger_stats:');
  console.log('  error:', result.trigger_stats.error);
  console.log('  permission:', result.trigger_stats.permission);
  console.log('  action:', result.trigger_stats.action);
  console.log('conclusion:', result.conclusion_reason);
}
