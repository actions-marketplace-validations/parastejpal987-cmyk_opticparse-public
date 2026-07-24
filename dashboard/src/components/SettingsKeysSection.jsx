import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';

export default function SettingsKeysSection({ user }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchKeys = async () => {
    try {
      const res = await fetch(`https://opticparse-python-sg.onrender.com/gateway/keys/${user.id}`);
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchKeys();
  }, [user]);

  const handleGenerate = async () => {
    if (keys.length >= 3) return alert("Maximum of 3 active keys allowed.");
    try {
      const res = await fetch('https://opticparse-python-sg.onrender.com/gateway/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id })
      });
      const data = await res.json();
      alert(`IMPORTANT! Save this key, it will not be shown again: ${data.api_key}`);
      fetchKeys();
    } catch (e) {
      console.error(e);
      alert("Failed to generate key");
    }
  };

  const handleRevoke = async (prefix) => {
    if (!confirm(`Are you sure you want to revoke key ending in ${prefix}?`)) return;
    try {
      await fetch(`https://opticparse-python-sg.onrender.com/gateway/keys/${user.id}/${prefix}`, {
        method: 'DELETE'
      });
      fetchKeys();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="card mt-2 animate-in">
      <h2>Active API Keys ({keys.length}/3)</h2>
      <p style={{color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem'}}>
        You can generate up to 3 active API keys to separate your Live and Test environments.
      </p>
      
      {loading ? (
        <div>Loading keys...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Prefix</th>
              <th style={{ padding: '0.5rem' }}>Created At</th>
              <th style={{ padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.5rem' }}>op_live_••••••••{k.key_prefix}</td>
                <td style={{ padding: '0.5rem', color: 'var(--muted)' }}>{new Date(k.created_at).toLocaleString()}</td>
                <td style={{ padding: '0.5rem' }}>
                  <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => handleRevoke(k.key_prefix)}>Revoke</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      
      

      {keys.length < 3 && (
        <button className="btn btn-primary" style={{marginTop: '1rem'}} onClick={handleGenerate}>
          + Generate New Key
        </button>
      )}
    </div>
  );
}
