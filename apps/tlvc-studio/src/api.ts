const TOKEN_KEY = 'tlvc-studio-token';

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(value: string | null): void {
  if (value) sessionStorage.setItem(TOKEN_KEY, value);
  else sessionStorage.removeItem(TOKEN_KEY);
}

async function request(
  url: string,
  options: RequestInit & { token?: boolean } = {}
): Promise<Response> {
  const { token: sendToken = true, ...init } = options;
  const headers = new Headers(init.headers);
  if (sendToken) {
    const t = getToken();
    if (t) headers.set('x-tlvc-token', t);
  }
  return fetch(url, { ...init, headers });
}

export interface ProfileListItem {
  id: string;
  filename: string;
  name: string;
  description?: string;
  tags: string[];
  updatedAt: string;
}

export interface ListProfilesResponse {
  profiles: ProfileListItem[];
  defaultProfile: string;
  canWriteIndex: boolean;
}

export async function listProfiles(): Promise<ListProfilesResponse> {
  const r = await request('/api/profiles');
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getProfile(name: string): Promise<unknown> {
  const r = await request(`/api/profiles/${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function saveProfile(name: string, profile: unknown): Promise<{ warnings?: string[] }> {
  const r = await request(`/api/profiles/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  if (!r.ok) {
    const text = await r.text();
    let err: string;
    try {
      const j = JSON.parse(text);
      err = j.errors?.join('; ') || j.error || text;
    } catch {
      err = text || `Save failed: ${r.status}`;
    }
    throw new Error(err);
  }
  return r.json();
}

export async function createProfile(name: string, baseProfile?: string): Promise<{ filename: string; id: string }> {
  const r = await request('/api/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, baseProfile }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function cloneProfile(name: string): Promise<{ filename: string; id: string }> {
  const r = await request(`/api/profiles/${encodeURIComponent(name)}/clone`, { method: 'POST' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteProfile(name: string): Promise<void> {
  const r = await request(`/api/profiles/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
}

export async function setDefaultProfile(name: string): Promise<void> {
  const r = await request(`/api/profiles/${encodeURIComponent(name)}/set-default`, { method: 'POST' });
  if (!r.ok) throw new Error(await r.text());
}

export interface PreviewResult {
  messagesPreview: Array<{
    ts: string;
    sender: string;
    text: string;
    reply_to: string | null;
    attachments?: Array<{ kind: string; path: string }>;
  }>;
  stats: { totalMessages: number; senderCounts: Record<string, number>; tsMissingCount: number };
  extractionDebug?: {
    containerMatches: number;
    perField: {
      sender: { ruleHits: Array<{ ruleIndex: number; hitCount: number }>; examples: Array<{ ruleIndex: number; samples: string[] }> };
      ts: { ruleHits: Array<{ ruleIndex: number; hitCount: number }>; examples: Array<{ ruleIndex: number; samples: string[] }> };
      text: { ruleHits: Array<{ ruleIndex: number; hitCount: number }>; examples: Array<{ ruleIndex: number; samples: string[] }> };
    };
  };
}

export async function preview(html: File, profileName?: string, profileJson?: unknown): Promise<PreviewResult> {
  const form = new FormData();
  form.append('html', html);
  if (profileName) form.append('profileName', profileName);
  if (profileJson) form.append('profileJson', JSON.stringify(profileJson));
  const r = await request('/api/preview', { method: 'POST', body: form });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export interface ResolvedInput {
  kind: 'file' | 'dir';
  exportRootDir: string;
  messagesHtmlPath: string;
  assets: { photosDir?: string; imagesDir?: string; cssDir?: string; jsDir?: string };
}

export async function resolveInput(file?: File, inputPath?: string): Promise<ResolvedInput> {
  const form = new FormData();
  if (inputPath?.trim()) form.append('inputPath', inputPath.trim());
  if (file) form.append('html', file);
  if (!form.has('inputPath') && !form.has('html')) throw new Error('Provide file or inputPath');
  const r = await request('/api/resolve-input', { method: 'POST', body: form });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function runStep2(params: {
  epId: string;
  k: number;
  tz: string;
  profileName?: string;
  html?: File;
  inputPath?: string;
}): Promise<{
  exitCode: number;
  outDir: string;
  lintReport: unknown;
  top1SegmentSummary: unknown;
  resolved?: ResolvedInput;
}> {
  const form = new FormData();
  form.append('epId', params.epId);
  form.append('k', String(params.k));
  form.append('tz', params.tz);
  if (params.profileName) form.append('profileName', params.profileName);
  if (params.inputPath) form.append('inputPath', params.inputPath);
  if (params.html) form.append('html', params.html);
  const r = await request('/api/run-step2', { method: 'POST', body: form });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getStep2Output(epId: string): Promise<Record<string, unknown>> {
  const r = await request(`/api/episodes/${encodeURIComponent(epId)}/step2`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
