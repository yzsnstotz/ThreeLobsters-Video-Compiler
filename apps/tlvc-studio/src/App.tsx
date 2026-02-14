import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { getToken, setToken, getWatchStep2Status, startWatchStep2, stopWatchStep2 } from './api';
import { ExtractorsList } from './pages/ExtractorsList';

const ExtractorEdit = lazy(() => import('./pages/ExtractorEdit').then((m) => ({ default: m.ExtractorEdit })));
const RunStep2 = lazy(() => import('./pages/RunStep2').then((m) => ({ default: m.RunStep2 })));

const POLL_WATCH_MS = 4000;

export default function App() {
  const [token, setTokenState] = useState(getToken() ?? '');
  const handleTokenChange = (v: string) => {
    setTokenState(v);
    setToken(v || null);
  };

  const [watchStatus, setWatchStatus] = useState<{ running: boolean; pid?: number } | null>(null);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);

  const refreshWatchStatus = useCallback(() => {
    getWatchStep2Status()
      .then(setWatchStatus)
      .catch(() => setWatchStatus({ running: false }));
  }, []);

  useEffect(() => {
    refreshWatchStatus();
  }, [refreshWatchStatus]);

  useEffect(() => {
    if (!watchStatus?.running) return;
    const t = setInterval(refreshWatchStatus, POLL_WATCH_MS);
    return () => clearInterval(t);
  }, [watchStatus?.running, refreshWatchStatus]);

  const handleWatchToggle = () => {
    setWatchError(null);
    setWatchLoading(true);
    if (watchStatus?.running) {
      stopWatchStep2()
        .then(() => refreshWatchStatus())
        .catch((e) => setWatchError(e.message))
        .finally(() => setWatchLoading(false));
    } else {
      startWatchStep2()
        .then(() => refreshWatchStatus())
        .catch((e) => setWatchError(e.message))
        .finally(() => setWatchLoading(false));
    }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <nav>
          <NavLink to="/extractors" className={({ isActive }) => (isActive ? 'active' : '')}>
            Extractors
          </NavLink>
          <NavLink to="/runs/step2" className={({ isActive }) => (isActive ? 'active' : '')}>
            Step2 Runner
          </NavLink>
          <span style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Step3 / Step4 (placeholder)</span>
        </nav>
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Watch Step2</div>
          {watchError && <div style={{ fontSize: '0.75rem', color: 'var(--error)', marginBottom: '0.35rem' }}>{watchError}</div>}
          <button
            type="button"
            className="btn"
            style={{ width: '100%', minHeight: 36 }}
            disabled={watchLoading}
            onClick={handleWatchToggle}
          >
            {watchLoading ? '…' : watchStatus?.running ? `Stop watcher (pid ${watchStatus.pid ?? '?'})` : 'Start watcher'}
          </button>
          {watchStatus && !watchLoading && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {watchStatus.running ? 'Running' : 'Stopped'}
            </div>
          )}
        </div>
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Token (if required)
            <input
              type="password"
              value={token}
              onChange={(e) => handleTokenChange(e.target.value)}
              placeholder="x-tlvc-token"
              style={{ marginTop: 0.25, width: '100%', minHeight: 36 }}
            />
          </label>
        </div>
      </aside>
      <main className="main">
        <Suspense fallback={<p style={{ padding: '1rem' }}>Loading…</p>}>
          <Routes>
            <Route path="/" element={<ExtractorsList />} />
            <Route path="/extractors" element={<ExtractorsList />} />
            <Route path="/extractors/:name" element={<ExtractorEdit />} />
            <Route path="/runs/step2" element={<RunStep2 />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
