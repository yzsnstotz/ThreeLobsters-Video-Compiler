import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProfile, saveProfile, preview, cloneProfile } from '../api';
import type { ExtractorProfile } from '../types';
import { RuleEditor } from '../components/RuleEditor';

export function ExtractorEdit() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ExtractorProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<Awaited<ReturnType<typeof preview>> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedEditable, setAdvancedEditable] = useState(false);
  const [rawJson, setRawJson] = useState('');
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPreviewProfileRef = useRef<string>('');
  const lastPreviewFileRef = useRef<File | null>(null);

  useEffect(() => {
    if (!name) return;
    getProfile(name)
      .then((p) => {
        const prof = p as ExtractorProfile;
        setProfile(prof);
        setRawJson(JSON.stringify(prof, null, 2));
      })
      .catch((e) => setErr(e.message));
  }, [name]);

  useEffect(() => {
    if (profile && !advancedEditable) setRawJson(JSON.stringify(profile, null, 2));
  }, [profile, advancedEditable]);

  const runPreview = useCallback((html: File, prof: ExtractorProfile) => {
    setPreviewLoading(true);
    setPreviewResult(null);
    preview(html, undefined, prof)
      .then(setPreviewResult)
      .catch((e) => setErr(e.message))
      .finally(() => setPreviewLoading(false));
  }, []);

  useEffect(() => {
    if (!profile || !previewFile) return;
    const key = JSON.stringify(profile.message) + profile.sender.rules.length + profile.ts.rules.length + profile.text.rules.length;
    if (lastPreviewProfileRef.current === key && lastPreviewFileRef.current === previewFile) return;
    if (throttleRef.current) clearTimeout(throttleRef.current);
    throttleRef.current = setTimeout(() => {
      lastPreviewProfileRef.current = key;
      lastPreviewFileRef.current = previewFile;
      runPreview(previewFile, profile);
      throttleRef.current = null;
    }, 300);
    return () => {
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, [profile, previewFile, runPreview]);

  const handleSave = () => {
    if (!name || !profile) return;
    setErr(null);
    setSaving(true);
    saveProfile(name, profile)
      .then(() => setErr(null))
      .catch((e) => setErr(e.message))
      .finally(() => setSaving(false));
  };

  const handleSaveAs = () => {
    if (!name || !profile) return;
    setErr(null);
    setSaving(true);
    cloneProfile(name)
      .then(({ id }) => {
        navigate(`/extractors/${id}`);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setSaving(false));
  };

  const handleSaveFromAdvanced = () => {
    let p: unknown;
    try {
      p = JSON.parse(rawJson);
    } catch {
      setErr('Invalid JSON');
      return;
    }
    setErr(null);
    setSaving(true);
    const filename = name?.endsWith('.json') ? name : `${name}.json`;
    saveProfile(filename.replace(/\.json$/, ''), p)
      .then(() => {
        setProfile(p as ExtractorProfile);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setSaving(false));
  };

  if (err && !profile) {
    return (
      <div className="card">
        <p className="errors">Error: {err}</p>
      </div>
    );
  }

  if (!profile) return null;

  const meta = profile.meta ?? { id: name!, name: name!, version: 1, updatedAt: new Date().toISOString() };
  const extractionDebug = previewResult?.extractionDebug;

  return (
    <div className="extractor-edit">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Edit: {(meta as { name?: string }).name ?? name}</h1>
        {err && <p className="errors">{err}</p>}
        <div className="form-section">
          <label>
            <span>Profile name</span>
            <input
              type="text"
              value={(meta as { name?: string }).name ?? ''}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  meta: { ...meta, name: e.target.value } as ExtractorProfile['meta'],
                })
              }
            />
          </label>
        </div>
        <div className="form-section">
          <label>
            <span>Message container selector</span>
            <input
              type="text"
              value={profile.message.containerSelector}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  message: { containerSelector: e.target.value },
                })
              }
              placeholder={'e.g. div[class*="message"]'}
            />
          </label>
          {previewResult?.extractionDebug != null && (
            <p className="text-muted">Container matches: {previewResult.extractionDebug.containerMatches}</p>
          )}
        </div>
        <RuleEditor
          fieldName="Sender"
          rules={profile.sender.rules}
          onChange={(rules) => setProfile({ ...profile, sender: { rules } })}
          hitCounts={extractionDebug?.perField.sender.ruleHits}
          examples={extractionDebug?.perField.sender.examples}
        />
        <RuleEditor
          fieldName="TS"
          rules={profile.ts.rules}
          onChange={(rules) => setProfile({ ...profile, ts: { rules } })}
          hitCounts={extractionDebug?.perField.ts.ruleHits}
          examples={extractionDebug?.perField.ts.examples}
        />
        <RuleEditor
          fieldName="Text"
          rules={profile.text.rules}
          onChange={(rules) => setProfile({ ...profile, text: { rules } })}
          showPreserveNewlines
          hitCounts={extractionDebug?.perField.text.ruleHits}
          examples={extractionDebug?.perField.text.examples}
        />
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button type="button" className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn" onClick={handleSaveAs} disabled={saving}>
            Save As (clone)
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Preview</h2>
        <p>Upload HTML to see parsed messages. Preview updates automatically (300ms throttle).</p>
        <input
          type="file"
          accept=".html,text/html"
          onChange={(e) => {
            setPreviewFile(e.target.files?.[0] ?? null);
            setPreviewResult(null);
          }}
        />
        {previewLoading && <p className="text-muted">Loading…</p>}
        {previewResult && !previewLoading && (
          <>
            <p>
              <strong>Total:</strong> {previewResult.stats.totalMessages} ·{' '}
              <strong>TS missing:</strong> {previewResult.stats.tsMissingCount} ·{' '}
              <strong>Roles:</strong> {JSON.stringify(previewResult.stats.senderCounts)}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>ts</th><th>sender</th><th>text</th></tr>
                </thead>
                <tbody>
                  {previewResult.messagesPreview.slice(0, 100).map((m, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{m.ts || '—'}</td>
                      <td>{m.sender}</td>
                      <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.text.slice(0, 100)}{m.text.length > 100 ? '…' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewResult.messagesPreview.length > 100 && (
              <p className="text-muted">Showing first 100 of {previewResult.messagesPreview.length}.</p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div
          className="collapsible-header"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setAdvancedOpen(!advancedOpen)}
        >
          {advancedOpen ? '▼' : '▶'} Advanced JSON {advancedEditable ? '(editable)' : '(read-only)'}
        </div>
        {advancedOpen && (
          <div className="collapsible-content">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                checked={advancedEditable}
                onChange={(e) => setAdvancedEditable(e.target.checked)}
              />
              Allow edit
            </label>
            <textarea
              value={rawJson}
              onChange={(e) => advancedEditable && setRawJson(e.target.value)}
              readOnly={!advancedEditable}
              rows={14}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.9rem' }}
            />
            {advancedEditable && (
              <button type="button" className="btn" onClick={() => setRawJson(JSON.stringify(profile, null, 2))}>
                Sync from form
              </button>
            )}
            {advancedEditable ? (
              <button type="button" className="btn primary" onClick={handleSaveFromAdvanced} disabled={saving} style={{ marginLeft: '0.5rem' }}>
                Save from JSON
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(rawJson)}>
                Copy JSON
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
