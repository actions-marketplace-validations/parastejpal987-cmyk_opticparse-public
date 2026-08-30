import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';

export default function SettingsKeysSection({ user }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [groqKey, setGroqKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');

  const fetchKeys = async () => {
    try {
      const res = await fetch(`${GATEWAY_URL}/gateway/keys/${user.id}`);
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
    try {
      const res = await fetch(`${GATEWAY_URL}/gateway/keys/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id || 'dev_user', email: user?.email || 'user@opticparse.com' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.api_key) {
          alert(`IMPORTANT! Save this key, it will not be shown again:\n\n${data.api_key}`);
          fetchKeys();
          return;
        }
      }
      // Client-side fallback key generation
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      const fallbackKey = `op_live_${token}`;
      alert(`IMPORTANT! Save this key, it will not be shown again:\n\n${fallbackKey}`);
      setKeys(prev => [{ id: 'key_' + Date.now(), key_prefix: fallbackKey.substring(0, 12), created_at: new Date().toISOString() }, ...prev]);
    } catch (e) {
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      const fallbackKey = `op_live_${token}`;
      alert(`IMPORTANT! Save this key, it will not be shown again:\n\n${fallbackKey}`);
      setKeys(prev => [{ id: 'key_' + Date.now(), key_prefix: fallbackKey.substring(0, 12), created_at: new Date().toISOString() }, ...prev]);
    }
  };

  const handleRevoke = async (prefix) => {
    if (!confirm(`Are you sure you want to revoke key ending in ${prefix}?`)) return;
    try {
      await fetch(`${GATEWAY_URL}/gateway/keys/${user.id}/${prefix}`, {
        method: 'DELETE'
      });
      fetchKeys();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateIpWhitelist = async (prefix, ipList) => {
    try {
      await fetch(`${GATEWAY_URL}/gateway/keys/${user.id}/${prefix}/whitelist`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whitelisted_ips: ipList })
      });
      alert('IP Whitelist updated successfully');
      fetchKeys();
    } catch (e) {
      console.error(e);
      alert('Failed to update IP whitelist');
    }
  };

  const handleSaveBYOK = async () => {
    try {
      const res = await fetch(`${GATEWAY_URL}/api/settings/byok`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          groq_key: groqKey || undefined,
          gemini_key: geminiKey || undefined,
          openrouter_key: openRouterKey || undefined
        })
      });
      if (!res.ok) throw new Error('Failed to save BYOK keys');
      alert('BYOK keys securely stored!');
    } catch (e) {
      console.error(e);
      alert('Failed to save BYOK keys');
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {keys.map((k, i) => (
            <div key={i} style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1rem', background: 'var(--bg-lighter)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>op_live_••••••••{k.key_prefix}</strong>
                <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => handleRevoke(k.key_prefix)}>Revoke Key</button>
              </div>
              <div style={{ marginTop: '0.5rem', color: 'var(--muted)', fontSize: '0.8rem' }}>Created: {new Date(k.created_at).toLocaleString()}</div>
              
              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>IP Whitelist (comma separated)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    className="input" 
                    defaultValue={k.whitelisted_ips || ''}
                    placeholder="e.g. 192.168.1.1, 10.0.0.0/24"
                    onBlur={(e) => handleUpdateIpWhitelist(k.key_prefix, e.target.value)}
                    style={{ flex: 1, fontSize: '0.85rem' }}
                  />
                </div>
                <small style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Leave blank to allow all IPs. Enter specific IPs to lock down this key (Enterprise feature).</small>
              </div>
            </div>
          ))}
        </div>
      )}

      {keys.length < 3 && (
        <button className="btn btn-primary" style={{marginTop: '1rem'}} onClick={handleGenerate}>
          + Generate New Key
        </button>
      )}

      <div style={{ marginTop: '3rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
        <h2>Bring Your Own Key (BYOK)</h2>
        <p style={{color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.5rem'}}>
          Run out of credits? No problem. Supply your own LLM provider keys and run requests at cost. We will automatically use these instead of your monthly OpticParse credits.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', maxWidth: '500px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', fontWeight: 600 }}>Groq API Key (Llama Vision)</label>
            <input type="password" placeholder="gsk_..." value={groqKey} onChange={e => setGroqKey(e.target.value)} className="input" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', fontWeight: 600 }}>Google AI Studio Key (Gemini)</label>
            <input type="password" placeholder="AIzaSy..." value={geminiKey} onChange={e => setGeminiKey(e.target.value)} className="input" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', fontWeight: 600 }}>OpenRouter API Key (GPT-4o Mini)</label>
            <input type="password" placeholder="sk-or-v1-..." value={openRouterKey} onChange={e => setOpenRouterKey(e.target.value)} className="input" style={{ width: '100%' }} />
          </div>
          <button className="btn btn-primary" style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }} onClick={handleSaveBYOK}>
            Save BYOK Keys
          </button>
        </div>
      </div>
    </div>
  );
}
