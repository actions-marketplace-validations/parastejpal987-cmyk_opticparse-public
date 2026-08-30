import React, { useState, useEffect } from 'react';
import { supabase } from '../context';

export default function ApiKeyManager({ user, initialKey, onRegenerate }) {
  const [keys, setKeys] = useState([]);
  const [showKeyId, setShowKeyId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState(null); // Track the one-time raw key

  const fetchKeys = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setKeys(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [user?.id]);

  const handleCopy = async (keyStr, id) => {
    if (!keyStr) return;
    try {
      await navigator.clipboard.writeText(keyStr);
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = keyStr;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const hashKey = async (rawKey) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(rawKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleCreateNew = async () => {
    try {
      // 1. Generate secure random 32-byte key
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const rawBytes = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      const rawKey = `op_live_${rawBytes}`;
      
      const newKeyObj = {
        id: 'key_' + Date.now(),
        name: 'Production API Key',
        key_prefix: rawKey.substring(0, 12),
        created_at: new Date().toISOString(),
        raw: rawKey
      };

      // 2. Try saving to Supabase if session exists
      if (user?.id) {
        try {
          const keyHash = await hashKey(rawKey);
          await supabase
            .from('api_keys')
            .insert([{
              user_id: user.id,
              name: 'Production API Key',
              key_prefix: rawKey.substring(0, 12),
              key_hash: keyHash,
              scopes: ['full_access']
            }]);
        } catch (dbErr) {
          console.warn('Supabase DB key save fallback to local state:', dbErr);
        }
      }
      
      // 3. Save to local storage and update UI
      localStorage.setItem(`opticparse_apikey_${user?.id || 'guest'}`, rawKey);
      setNewlyGeneratedKey({ id: newKeyObj.id, raw: rawKey });
      setKeys(prev => [newKeyObj, ...prev]);
      if (onRegenerate) onRegenerate(rawKey);
    } catch (e) {
      console.error('Error generating key:', e);
      // Emergency client generation
      const fallbackKey = `op_live_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;
      setNewlyGeneratedKey({ id: 'key_' + Date.now(), raw: fallbackKey });
      setKeys(prev => [{ id: 'key_' + Date.now(), key_prefix: fallbackKey.substring(0, 12), created_at: new Date().toISOString() }, ...prev]);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to revoke this key?')) return;
    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      if (newlyGeneratedKey?.id === id) setNewlyGeneratedKey(null);
      fetchKeys();
    } catch (e) {
      console.error(e);
      alert('Failed to revoke key.');
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(167, 139, 250, 0.05) 0%, rgba(30, 30, 36, 0.9) 100%)',
      border: '1px solid rgba(167, 139, 250, 0.2)',
      borderRadius: '24px',
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'inline-block', padding: '0.4rem 1rem', background: 'var(--purple-dim)', color: 'var(--purple)', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.75rem', letterSpacing: '1px' }}>
            ✦ AUTHENTICATION
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900 }}>API Keys</h2>
          <p style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>Manage access keys and webhooks for your environments.</p>
        </div>
        <button onClick={handleCreateNew} style={{ padding: '0.6rem 1rem', background: 'var(--purple)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
          + Generate Key
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#a1a1aa' }}>
              <th style={{ padding: '1rem 0' }}>Name</th>
              <th style={{ padding: '1rem 0' }}>Key Token</th>
              <th style={{ padding: '1rem 0' }}>Scope</th>
              <th style={{ padding: '1rem 0' }}>Last Used</th>
              <th style={{ padding: '1rem 0', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const isNewlyGenerated = newlyGeneratedKey?.id === k.id;
              const displayKey = isNewlyGenerated 
                ? newlyGeneratedKey.raw 
                : `${k.key_prefix}************************`;
              
              return (
                <tr key={k.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '1rem 0', fontWeight: 700 }}>{k.name}</td>
                  <td style={{ padding: '1rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.4)', padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', width: 'fit-content' }}>
                      <code style={{ color: isNewlyGenerated ? '#10b981' : '#a1a1aa', fontFamily: 'monospace' }}>
                        {displayKey}
                      </code>
                    </div>
                    {isNewlyGenerated && (
                      <div style={{ fontSize: '0.7rem', color: '#f87171', marginTop: '0.25rem' }}>
                        Copy this key now. You won't be able to see it again!
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem 0' }}>
                    <span style={{ padding: '0.2rem 0.5rem', background: 'rgba(167, 139, 250, 0.1)', color: 'var(--purple)', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>{k.scopes ? k.scopes[0] : 'full_access'}</span>
                  </td>
                  <td style={{ padding: '1rem 0', color: '#a1a1aa' }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</td>
                  <td style={{ padding: '1rem 0', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      {isNewlyGenerated && (
                        <button onClick={() => handleCopy(newlyGeneratedKey.raw, k.id)} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                          {copiedId === k.id ? 'Copied' : 'Copy'}
                        </button>
                      )}
                      <button onClick={() => handleDelete(k.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: 'none', padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
