import { useState, Suspense, lazy } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { getToken, setToken } from './api';
import { ExtractorsList } from './pages/ExtractorsList';

const ExtractorEdit = lazy(() => import('./pages/ExtractorEdit').then((m) => ({ default: m.ExtractorEdit })));
const RunStep2 = lazy(() => import('./pages/RunStep2').then((m) => ({ default: m.RunStep2 })));

export default function App() {
  const [token, setTokenState] = useState(getToken() ?? '');
  const handleTokenChange = (v: string) => {
    setTokenState(v);
    setToken(v || null);
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
