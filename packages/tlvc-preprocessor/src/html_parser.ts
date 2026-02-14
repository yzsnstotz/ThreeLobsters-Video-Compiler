/**
 * HTML → messages[]. Profile-driven via tlvc-extractor when profile is provided;
 * ts_raw kept for lint; ts stored as ISO via parseTelegramTitleTs.
 */

import type { TranscriptMessage } from 'tlvc-schema';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { parseMessagesFromHtml } from 'tlvc-extractor';
import type { ExtractorProfile } from 'tlvc-extractor';
import { parseTelegramTitleTs } from './ts_parse';

const DEFAULT_PROFILE_PATH = 'profiles/extractors/telegram_export_v1.json';
const DEFAULT_CONTAINER_SELECTOR = 'div.message.default';

function loadProfile(profilePath: string): ExtractorProfile {
  const resolved = resolve(process.cwd(), profilePath);
  if (!existsSync(resolved)) {
    throw new Error(`Profile not found: ${resolved}`);
  }
  const raw = readFileSync(resolved, 'utf-8');
  const profile = JSON.parse(raw) as ExtractorProfile;
  if (!profile?.message || !profile.sender?.rules || !profile.ts?.rules || !profile.text?.rules) {
    throw new Error(`Invalid profile: missing required fields (message, sender.rules, ts.rules, text.rules)`);
  }
  if (!profile.message.containerSelector?.trim()) {
    profile.message = { ...profile.message, containerSelector: DEFAULT_CONTAINER_SELECTOR };
  }
  return profile;
}

export function assignMessageIds(messages: Omit<TranscriptMessage, 'id'>[]): TranscriptMessage[] {
  return messages.map((m, i) => ({
    ...m,
    id: 'm' + String(i + 1).padStart(6, '0'),
  }));
}

/**
 * Parse HTML file with optional profile and tz. ts_raw kept from extractor; ts = parseTelegramTitleTs(ts_raw, tz) ?? ''.
 */
export function parseAndAssignIds(inputFile: string, profilePath?: string, tz?: string): TranscriptMessage[] {
  const html = readFileSync(inputFile, 'utf-8');
  let profileToUse = profilePath ?? DEFAULT_PROFILE_PATH;
  if (profileToUse && !profileToUse.includes('/') && !profileToUse.endsWith('.json')) {
    profileToUse = `profiles/extractors/${profileToUse}.json`;
  }
  const profile = loadProfile(profileToUse);
  const { messages } = parseMessagesFromHtml(html, profile);
  const withIds: Omit<TranscriptMessage, 'id'>[] = messages.map((m) => {
    const ts_raw = m.ts?.trim() ?? '';
    const ts = (ts_raw ? parseTelegramTitleTs(ts_raw, tz) : null) ?? '';
    return {
      id: '',
      ts,
      ts_raw: ts_raw || undefined,
      sender: m.sender,
      text: m.text,
      reply_to: m.reply_to,
      attachments: [],
    };
  });
  return assignMessageIds(withIds);
}
