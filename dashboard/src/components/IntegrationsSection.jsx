import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';
import Dashboard from './Dashboard';

export default function IntegrationsSection({ user }) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState(localStorage.getItem('opticparse_webhook_secret') || '');
  const [isSaving, setIsSaving] = useState(false);
  const { user: authUser } = useAuth(); // Need auth for backend

  useEffect(() => {
    const fetchWebhook = async () => {
      try {
        const res = await fetch('https://opticparse-python-sg.onrender.com/api/settings/webhook', {
          headers: {
            'Authorization': `Bearer ${authUser?.id}` // Simulating auth header using user ID or real token
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.webhook_url) setWebhookUrl(data.webhook_url);
        }
      } catch (e) {
        console.error(e);
      }
    };
    if (authUser) fetchWebhook();
  }, [authUser]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch('https://opticparse-python-sg.onrender.com/api/settings/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authUser?.id}`
        },
        body: JSON.stringify({ url: webhookUrl })
      });
      localStorage.setItem('opticparse_webhook_secret', webhookSecret);
      alert('Integration settings saved!');
    } catch (e) {
      console.error(e);
      alert('Failed to save settings');
    }
    setIsSaving(false);
  };

  const testWebhook = async () => {
    if (!webhookUrl) return alert('Please enter a webhook URL first.');
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "Hello from OpticParse & PhishVision! Your webhook integration is working." })
      });
      if (res.ok) alert('Test webhook sent successfully!');
      else alert(`Webhook failed with status: ${res.status}`);
    } catch (e) {
      alert(`Webhook error: ${e.message}`);
    }
  };

  return (
    <div className="card mt-2 animate-in">
      <h2>Integrations & Webhooks</h2>
      <p style={{color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem'}}>
        Configure webhooks to automatically push scan results to Discord or Slack when a background Cron Job (Watch/Monitor) finishes.
      </p>
      
      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Global Webhook URL (Discord / Slack)</label>
        <input 
          type="url" 
          placeholder="https://discord.com/api/webhooks/..." 
          value={webhookUrl} 
          onChange={e => setWebhookUrl(e.target.value)}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', background: '#1a1a24', color: 'white' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button className="btn btn-primary" onClick={handleSave}>Save Webhook</button>
          <button className="btn btn-outline" onClick={testWebhook}>Test Webhook</button>
        </div>
      </div>
      <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
        Note: When you create a new Monitor via the API Docs, this URL will automatically be injected if you use the Dashboard interface in the future.
      </div>
    </div>
  );
}
