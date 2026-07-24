import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL, PHISH_API_URL } from '../context';

export default function WatchDashboardSection({ usage, setPage }) {
  const [watches, setWatches] = useState([]);
  const [monitors, setMonitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('opticparse'); // 'opticparse' or 'phishvision'
  const [showCreate, setShowCreate] = useState(false);
  const [createUrl, setCreateUrl] = useState('');
  const [createQuery, setCreateQuery] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const resOp = await fetch(`${GATEWAY_URL}/gateway/watches`);
      const dataOp = await resOp.json();
      setWatches(dataOp.watches || []);
      
      const resPv = await fetch(`${PHISH_API_URL}/api/monitors`);
      const dataPv = await resPv.json();
      setMonitors(dataPv.monitors || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id, type) => {
    if (!confirm("Delete this monitor?")) return;
    try {
      if (type === 'opticparse') {
        await fetch(`${GATEWAY_URL}/api/watch/${id}`, { method: 'DELETE' });
      } else {
        await fetch(`${PHISH_API_URL}/api/monitor/${id}`, { method: 'DELETE' });
      }
      fetchData();
    } catch (e) {
      console.error(e);
      console.error(e);
    }
  };

  const handleCreateOpticParseMonitor = async (e) => {
    e.preventDefault();
    try {
      await fetch(`${GATEWAY_URL}/gateway/watches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: createUrl, query: createQuery })
      });
      setShowCreate(false);
      setCreateUrl('');
      setCreateQuery('');
      fetchData();
    } catch (err) {
      console.error("Failed to create monitor", err);
    }
  };

  const handleCreatePhishVisionMonitor = async (e) => {
    e.preventDefault();
    try {
      await fetch(`${PHISH_API_URL}/api/monitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: createUrl, 
          webhook_url: localStorage.getItem('opticparse_webhook_url') || 'https://example.com/webhook',
          interval_minutes: 60
        })
      });
      setShowCreate(false);
      setCreateUrl('');
      fetchData();
    } catch (err) {
      console.error("Failed to create PV monitor", err);
    }
  };



  return (
    <div className="card mt-2 animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Cron Jobs & Monitors</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`btn ${view === 'opticparse' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView('opticparse')} style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>
            OpticParse ({watches.length})
          </button>
          <button className={`btn ${view === 'phishvision' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView('phishvision')} style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>
            PhishVision ({monitors.length})
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>
            + Create
          </button>
        </div>
      </div>
      
      {showCreate && view === 'opticparse' && (
        <form onSubmit={handleCreateOpticParseMonitor} className="mb-4 mt-3 p-3 rounded" style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)' }}>
          <h4 className="mb-3">Create OpticParse Monitor</h4>
          <div className="form-group mb-2">
            <label>Target URL</label>
            <input type="url" className="input-field" value={createUrl} onChange={e => setCreateUrl(e.target.value)} placeholder="https://example.com" required />
          </div>
          <div className="form-group mb-3">
            <label>Extraction Query</label>
            <input type="text" className="input-field" value={createQuery} onChange={e => setCreateQuery(e.target.value)} placeholder="What data to track?" required />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary">Create</button>
            <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </form>
      )}

      {showCreate && view === 'phishvision' && (
        <form onSubmit={handleCreatePhishVisionMonitor} className="mb-4 mt-3 p-3 rounded" style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)' }}>
          <h4 className="mb-3">Create PhishVision Monitor</h4>
          <div className="form-group mb-3">
            <label>Target URL</label>
            <input type="url" className="input-field" value={createUrl} onChange={e => setCreateUrl(e.target.value)} placeholder="https://example.com" required />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary">Create</button>
            <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </form>
      )}

      
      <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ color: 'var(--muted)' }}>Loading active monitors...</div>
        ) : view === 'opticparse' ? (
          watches.length === 0 ? <div style={{ color: 'var(--muted)' }}>No active OpticParse watches.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Target URL</th>
                  <th style={{ padding: '0.5rem' }}>Created At</th>
                  <th style={{ padding: '0.5rem' }}>Last Result</th>
                  <th style={{ padding: '0.5rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {watches.map(w => (
                  <tr key={w.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '0.5rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={w.url}>{w.url}</td>
                    <td style={{ padding: '0.5rem', color: 'var(--muted)' }}>{new Date(w.created_at * 1000).toLocaleString()}</td>
                    <td style={{ padding: '0.5rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.last_result?.substring(0, 50)}...</td>
                    <td style={{ padding: '0.5rem' }}>
                      <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => handleDelete(w.id, 'opticparse')}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          monitors.length === 0 ? <div style={{ color: 'var(--muted)' }}>No active PhishVision monitors.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Target URL</th>
                  <th style={{ padding: '0.5rem' }}>Interval (ms)</th>
                  <th style={{ padding: '0.5rem' }}>Last Verdict</th>
                  <th style={{ padding: '0.5rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {monitors.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '0.5rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.url}>{m.url}</td>
                    <td style={{ padding: '0.5rem', color: 'var(--muted)' }}>{m.interval_ms || m.intervalMs}</td>
                    <td style={{ padding: '0.5rem', color: (m.last_run_verdict || m.lastRunVerdict) === 'malicious' ? 'var(--red)' : 'var(--green)' }}>
                      {((m.last_run_verdict || m.lastRunVerdict) || 'pending').toUpperCase()}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => handleDelete(m.id, 'phishvision')}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
      <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
        To create a new watch/monitor, please use the <b>API Docs</b> endpoints or the <b>Integrations</b> tab.
      </div>
    </div>
  );
}
