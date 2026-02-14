import { useState, useEffect } from 'react';
import { listProfiles, runStep2, resolveInput, type ResolvedInput } from '../api';

interface LintEntry {
  code: string;
  message: string;
  examples?: string[];
}

interface LintReport {
  ok: boolean;
  exit_code: 0 | 2;
  summary: { errors: number; warnings: number; infos: number };
  errors: LintEntry[];
  warnings: LintEntry[];
  infos: LintEntry[];
}

interface Top1Segment {
  segment_id: string;
  start_ts: string;
  end_ts: string;
  message_ids: string[];
  score: number;
  reasons: Array<{ rule_id: string; points: number; detail: string }>;
  roles: Record<string, number>;
}

export function RunStep2() {
  const [listData, setListData] = useState<Awaited<ReturnType<typeof listProfiles>> | null>(null);
  const [epId, setEpId] = useState('ep_0007');
  const [k, setK] = useState(3);
  const [tz, setTz] = useState('Asia/Tokyo');
  const [profileName, setProfileName] = useState('');
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [serverInputPath, setServerInputPath] = useState('');
  const [resolved, setResolved] = useState<ResolvedInput | null>(null);
  const [resolving, setResolving] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{
    exitCode: number;
    outDir: string;
    lintReport: LintReport;
    top1SegmentSummary: Top1Segment | null;
  } | null>(null);

  useEffect(() => {
    listProfiles().then((data) => {
      setListData(data);
      const defaultId = data.defaultProfile?.replace(/\.json$/, '') ?? '';
      setProfileName((prev) => prev || defaultId || (data.profiles[0]?.id ?? ''));
    });
  }, []);

  const handleResolvePreview = () => {
    if (!htmlFile && !serverInputPath.trim()) {
      setErr('Pick messages.html or enter server path');
      return;
    }
    setErr(null);
    setResolving(true);
    resolveInput(htmlFile ?? undefined, serverInputPath.trim() || undefined)
      .then(setResolved)
      .catch((e) => setErr(e.message))
      .finally(() => setResolving(false));
  };

  const handleRun = () => {
    if (!htmlFile && !serverInputPath.trim()) {
      setErr('Pick messages.html or enter server path to export folder');
      return;
    }
    setErr(null);
    setResult(null);
    setRunning(true);
    runStep2({
      epId: epId.trim(),
      k,
      tz,
      profileName: profileName.trim() || undefined,
      html: htmlFile ?? undefined,
      inputPath: serverInputPath.trim() || undefined,
    })
      .then((r) => {
        setResult(r);
        if (r.resolved) setResolved(r.resolved);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setRunning(false));
  };

  const guessEpId = (filename: string) => {
    const m = filename.match(/ep[_\s]?(\d+)/i);
    if (m) setEpId('ep_' + m[1].padStart(4, '0'));
  };

  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Run Step2</h1>
        <p>Pick <strong>messages.html</strong> or enter a <strong>server path</strong> to an export folder. Output is written to <code>build/episodes/&lt;epId&gt;/step2_preprocess/</code>.</p>
        {err && <p className="errors">{err}</p>}
        <div style={{ display: 'grid', gap: '1rem', maxWidth: 520 }}>
          <label>
            <span style={{ display: 'block', marginBottom: 0.25 }}>Pick messages.html</span>
            <input
              type="file"
              accept=".html,text/html"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setHtmlFile(f ?? null);
                if (f) guessEpId(f.name);
                if (f) setResolved(null);
              }}
            />
          </label>
          <label>
            <span style={{ display: 'block', marginBottom: 0.25 }}>Or server path to export folder</span>
            <input
              type="text"
              value={serverInputPath}
              onChange={(e) => { setServerInputPath(e.target.value); setResolved(null); }}
              placeholder="/path/to/ChatExport_YYYY-MM-DD or .../messages.html"
            />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button type="button" className="btn" onClick={handleResolvePreview} disabled={resolving || (!htmlFile && !serverInputPath.trim())}>
              {resolving ? 'Resolving…' : 'Preview resolve'}
            </button>
            {(resolved || result?.resolved) && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                messages.html resolved
              </span>
            )}
          </div>
          {(resolved || result?.resolved) && (
            <div className="card" style={{ padding: '0.75rem', background: 'var(--bg-2)' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>Resolved input</h4>
              {(resolved || result?.resolved)?.kind === 'dir' && (
                <p style={{ margin: 0, fontSize: '0.85rem' }}>
                  <strong>Matched main file:</strong> {(resolved || result?.resolved)?.messagesHtmlPath?.split('/').pop() ?? '—'}
                </p>
              )}
              <p style={{ margin: (resolved || result?.resolved)?.kind === 'dir' ? '0.25rem 0 0 0' : 0, fontSize: '0.85rem', wordBreak: 'break-all' }}>
                <strong>messages_html:</strong> {(resolved || result?.resolved)?.messagesHtmlPath}
              </p>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                <strong>export_root:</strong> {(resolved || result?.resolved)?.exportRootDir}
              </p>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
                <strong>kind:</strong> {(resolved || result?.resolved)?.kind} ·{' '}
                assets: photos {((resolved || result?.resolved) as ResolvedInput)?.assets?.photosDir ? '✓' : '—'} · images {((resolved || result?.resolved) as ResolvedInput)?.assets?.imagesDir ? '✓' : '—'} · css {((resolved || result?.resolved) as ResolvedInput)?.assets?.cssDir ? '✓' : '—'} · js {((resolved || result?.resolved) as ResolvedInput)?.assets?.jsDir ? '✓' : '—'}
              </p>
            </div>
          )}
          <label>
            <span style={{ display: 'block', marginBottom: 0.25 }}>Profile (default used if empty)</span>
            <select
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              onFocus={() => !listData && listProfiles().then((d) => { setListData(d); setProfileName((p) => p || (d.defaultProfile?.replace(/\.json$/, '') ?? '')); })}
            >
              <option value="">— Use default —</option>
              {listData?.profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span style={{ display: 'block', marginBottom: 0.25 }}>Episode ID</span>
            <input
              type="text"
              value={epId}
              onChange={(e) => setEpId(e.target.value)}
              placeholder="ep_0007"
            />
          </label>
          <label>
            <span style={{ display: 'block', marginBottom: 0.25 }}>Top-K</span>
            <input
              type="number"
              min={1}
              value={k}
              onChange={(e) => setK(Number(e.target.value))}
            />
          </label>
          <label>
            <span style={{ display: 'block', marginBottom: 0.25 }}>Timezone</span>
            <input
              type="text"
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              placeholder="Asia/Tokyo"
            />
          </label>
          <button
            type="button"
            className="btn primary"
            onClick={handleRun}
            disabled={running || (!htmlFile && !serverInputPath.trim())}
          >
            {running ? 'Running…' : 'Run Step2'}
          </button>
        </div>
      </div>

      {result && (
        <div className="card">
          <h2>Result</h2>
          <p><strong>Exit code:</strong> {result.exitCode} · <strong>Output dir:</strong> <code>{result.outDir}</code></p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Copy path to open in file manager: {result.outDir}</p>
          <h3>Lint report</h3>
          <p>
            Errors: {result.lintReport.summary.errors} · Warnings: {result.lintReport.summary.warnings} · Infos: {result.lintReport.summary.infos}
          </p>
          {result.lintReport.errors.length > 0 && (
            <ul className="errors">
              {result.lintReport.errors.map((e, i) => (
                <li key={i}><strong>{e.code}</strong> {e.message}</li>
              ))}
            </ul>
          )}
          {result.lintReport.warnings.length > 0 && (
            <ul className="warnings">
              {result.lintReport.warnings.map((e, i) => (
                <li key={i}><strong>{e.code}</strong> {e.message}</li>
              ))}
            </ul>
          )}
          {result.top1SegmentSummary && (
            <>
              <h3>Top 1 segment</h3>
              <p>
                <strong>ID:</strong> {result.top1SegmentSummary.segment_id} ·{' '}
                <strong>Messages:</strong> {result.top1SegmentSummary.message_ids?.length ?? 0} ·{' '}
                <strong>Score:</strong> {result.top1SegmentSummary.score}
              </p>
              <p><strong>Roles:</strong> {JSON.stringify(result.top1SegmentSummary.roles)}</p>
              <p><strong>Reasons (top 3):</strong></p>
              <ul>
                {(result.top1SegmentSummary.reasons ?? []).slice(0, 3).map((r, i) => (
                  <li key={i}>{r.rule_id} +{r.points}: {r.detail}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
