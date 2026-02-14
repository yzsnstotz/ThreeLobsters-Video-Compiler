import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  listProfiles,
  createProfile,
  cloneProfile,
  deleteProfile,
  setDefaultProfile,
  preview,
  type ListProfilesResponse,
  type ProfileListItem,
} from '../api';

export function ExtractorsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<ListProfilesResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<Awaited<ReturnType<typeof preview>> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = () => {
    setErr(null);
    listProfiles()
      .then((res) => {
        setData(Array.isArray(res) ? { profiles: res, defaultProfile: '', canWriteIndex: true } : res);
      })
      .catch((e) => setErr(e?.message ?? String(e)));
  };
  useEffect(() => load(), []);

  const handleNew = () => {
    setErr(null);
    setActionLoading(true);
    createProfile('New profile')
      .then(({ id }) => {
        load();
        navigate(`/extractors/${id}`);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setActionLoading(false));
  };

  const handleNewFromBase = (base: string) => {
    setErr(null);
    setActionLoading(true);
    createProfile('Copied profile', base)
      .then(({ id }) => {
        load();
        navigate(`/extractors/${id}`);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setActionLoading(false));
  };

  const handleClone = (name: string) => {
    setErr(null);
    setActionLoading(true);
    cloneProfile(name)
      .then(({ id }) => {
        load();
        navigate(`/extractors/${id}`);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setActionLoading(false));
  };

  const handleDelete = (p: ProfileListItem) => {
    const def = data?.defaultProfile ?? '';
    if (def && (p.filename === def || p.id === def.replace(/\.json$/, ''))) {
      setErr('Cannot delete default profile. Set another as default first.');
      return;
    }
    if (!confirm(`Delete "${p.name}"?`)) return;
    setErr(null);
    setActionLoading(true);
    deleteProfile(p.id)
      .then(load)
      .catch((e) => setErr(e.message))
      .finally(() => setActionLoading(false));
  };

  const handleSetDefault = (name: string) => {
    setErr(null);
    setActionLoading(true);
    setDefaultProfile(name)
      .then(load)
      .catch((e) => setErr(e.message))
      .finally(() => setActionLoading(false));
  };

  const handleQuickPreview = () => {
    if (!previewFile || !selectedId) return;
    setPreviewLoading(true);
    setPreviewResult(null);
    preview(previewFile, selectedId)
      .then(setPreviewResult)
      .catch((e) => setErr(e.message))
      .finally(() => setPreviewLoading(false));
  };

  const profiles = data?.profiles ?? [];
  const defaultProfile = data?.defaultProfile ?? '';

  if (err && !data) {
    return (
      <div className="card">
        <p className="errors">Error: {err}</p>
        <button type="button" className="btn" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <h1 style={{ margin: 0 }}>Extractors</h1>
          {data === null && <span className="text-muted">Loading…</span>}
          <button type="button" className="btn primary" onClick={handleNew} disabled={actionLoading}>
            New
          </button>
          {profiles.length > 0 ? (
            <select
              onChange={(e) => handleNewFromBase(e.target.value)}
              value=""
              style={{ minWidth: 180 }}
              disabled={actionLoading}
            >
              <option value="">New from template…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.filename}>{p.name}</option>
              ))}
            </select>
          ) : null}
        </div>
        {err && <p className="errors">{err}</p>}
        <div className="profile-cards">
          {!profiles.length ? (
            <p className="text-muted">No profiles. Click New or add JSON files to profiles/extractors/.</p>
          ) : (
            profiles.map((p) => (
              <div key={p.id} className="card profile-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div>
                    <strong>{p.name}</strong>
                    {defaultProfile === p.filename || defaultProfile === p.id ? (
                      <span className="badge default">Default</span>
                    ) : null}
                  </div>
                  <code style={{ fontSize: '0.85rem' }}>{p.filename}</code>
                </div>
                {p.tags?.length ? <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>{p.tags.join(', ')}</p> : null}
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Updated {new Date(p.updatedAt).toLocaleString()}
                </p>
                <div className="profile-actions">
                  <Link to={`/extractors/${p.id}`} className="btn">Open</Link>
                  <button type="button" className="btn" onClick={() => handleClone(p.id)} disabled={actionLoading}>Clone</button>
                  <button type="button" className="btn" onClick={() => handleSetDefault(p.id)} disabled={actionLoading || defaultProfile === p.filename}>Set Default</button>
                  <button type="button" className="btn" onClick={() => handleDelete(p)} disabled={actionLoading}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <h2>Quick preview</h2>
        <p>Select a profile and upload HTML to test.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <select
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value || null)}
            style={{ minWidth: 200 }}
          >
            <option value="">— Select profile —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            type="file"
            accept=".html,text/html"
            onChange={(e) => {
              setPreviewFile(e.target.files?.[0] ?? null);
              setPreviewResult(null);
            }}
          />
          <button
            type="button"
            className="btn primary"
            onClick={handleQuickPreview}
            disabled={!previewFile || !selectedId || previewLoading}
          >
            {previewLoading ? 'Loading…' : 'Preview'}
          </button>
        </div>
        {previewResult && (
          <div style={{ marginTop: '1rem' }}>
            <p>
              <strong>Total:</strong> {previewResult.stats.totalMessages} ·{' '}
              <strong>TS missing:</strong> {previewResult.stats.tsMissingCount} ·{' '}
              <strong>Roles:</strong> {JSON.stringify(previewResult.stats.senderCounts)}
            </p>
            {previewResult.extractionDebug && (
              <p>
                <strong>Container matches:</strong> {previewResult.extractionDebug.containerMatches}
              </p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>ts</th><th>sender</th><th>text</th><th>att</th></tr>
                </thead>
                <tbody>
                  {previewResult.messagesPreview.slice(0, 30).map((m, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{m.ts || '—'}</td>
                      <td>{m.sender}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.text.slice(0, 80)}{m.text.length > 80 ? '…' : ''}</td>
                      <td>{Array.isArray(m.attachments) ? m.attachments.length : 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
