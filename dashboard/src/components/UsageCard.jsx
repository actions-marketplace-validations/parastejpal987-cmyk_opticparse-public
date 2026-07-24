import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';

export default function UsageCard({ usage, user, apiKey }) {
  const [usageHistory, setUsageHistory] = useState([]);

  useEffect(() => {
      const fetchHistory = async () => {
          if (!user) return;
          try {
              const res = await fetch(
                  `${import.meta.env.VITE_GATEWAY_URL}/gateway/usage/${user.id}/history`,
                  {
                      headers: { 'X-API-Key': apiKey }
                  }
              );
              if (res.ok) {
                  const data = await res.json();
                  const formatted = data.history.map(d => ({
                      day: d.date.slice(5),
                      requests: d.count
                  }));
                  setUsageHistory(formatted);
              }
          } catch (err) {
              console.error('Usage history fetch failed:', err);
          }
      };
      
      if (apiKey) fetchHistory();
  }, [apiKey, user]);
  const percent = usage.monthly_limit > 0 ? (usage.current_usage / usage.monthly_limit) * 100 : 0
  const fillClass = percent > 90 ? 'danger' : percent > 70 ? 'warning' : ''

  return (
    <div className="card animate-in">
      <div className="flex justify-between items-center mb-1">
        <div className="card-label" style={{ margin: 0 }}>API Usage</div>
        <span className={`tier-badge ${usage.tier}`}>{usage.tier}</span>
      </div>
      <div className="progress-container">
        <div className="progress-label">
          <span>{usage.current_usage.toLocaleString()} calls used</span>
          <span>{usage.monthly_limit.toLocaleString()} limit</span>
        </div>
        <div className="progress-bar">
          <div className={`progress-fill ${fillClass}`} style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
      </div>
      
      <div style={{ width: '100%', height: 100, marginTop: '1.5rem' }}>
        <ResponsiveContainer>
          <BarChart data={usageHistory}>
            <XAxis dataKey="day" stroke="var(--muted)" fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'var(--bg2)', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '12px' }} />
            <Bar dataKey="requests" fill="var(--primary)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '1rem' }}>
        Resets: {usage.usage_reset_at ? new Date(usage.usage_reset_at).toLocaleDateString() : 'End of month'}
      </div>
    </div>
  )
}
