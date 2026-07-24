import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';

export default function LogsSection({ user }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(`https://opticparse-python-sg.onrender.com/gateway/usage/${user.id}/logs`);
        const data = await res.json();
        setLogs(data.logs || []);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    if (user) fetchLogs();
  }, [user]);

  const exportCSV = () => {
    const headers = ["Timestamp", "Service", "Endpoint", "Status", "Response Time (ms)"];
    const rows = logs.map(l => [
      new Date(l.created_at).toLocaleString(),
      l.service,
      l.endpoint,
      l.status_code,
      l.response_time_ms
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "opticparse_api_logs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="card mt-2 animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Detailed API Logs</h2>
        <button className="btn btn-outline" onClick={exportCSV} disabled={logs.length === 0} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
          Export CSV
        </button>
      </div>
      
      {loading ? (
        <div>Loading logs...</div>
      ) : logs.length === 0 ? (
        <div style={{ color: 'var(--muted)' }}>No API usage recorded yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Timestamp</th>
                <th style={{ padding: '0.5rem' }}>Service</th>
                <th style={{ padding: '0.5rem' }}>Endpoint</th>
                <th style={{ padding: '0.5rem' }}>Status</th>
                <th style={{ padding: '0.5rem' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '0.5rem', color: 'var(--muted)' }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{ padding: '0.5rem', color: l.service === 'phishvision' ? 'var(--cyan)' : 'var(--blue)' }}>{l.service?.toUpperCase()}</td>
                  <td style={{ padding: '0.5rem' }}>{l.endpoint}</td>
                  <td style={{ padding: '0.5rem', color: l.status_code >= 400 ? 'var(--red)' : 'var(--green)' }}>{l.status_code}</td>
                  <td style={{ padding: '0.5rem' }}>{l.response_time_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
