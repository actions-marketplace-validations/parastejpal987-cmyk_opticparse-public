import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';

export default function ApiKeyCard({ apiKey, onRegenerate }) {
  const [copied, setCopied] = useState(false)
  const displayKey = apiKey ? apiKey : 'op_live_••••••••••••••••'

  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = apiKey;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="card animate-in">
      <div className="card-label">Your API Key</div>
      <div className="key-display">
        <span className="key-text">{displayKey}</span>
        <button className="key-copy-btn" onClick={handleCopy} title="Copy to clipboard">
          {copied ? '✓' : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
        </button>
      </div>
      <div className="flex gap-1">
        <button className="btn btn-outline" onClick={onRegenerate}>Regenerate Key</button>
      </div>
      <div style={{ marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--muted)' }}>Note: This key works for both products</div>
    </div>
  )
}
