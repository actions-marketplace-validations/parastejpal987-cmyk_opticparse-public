import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';

export default function QuickStatsBar({ usage }) {
  const daysUntilReset = () => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return Math.max(0, end.getDate() - now.getDate());
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
      <div className="card animate-in" style={{ padding: '1rem', marginBottom: 0 }}>
        <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Requests Used</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.25rem' }}>{usage.current_usage?.toLocaleString()}</div>
      </div>
      <div className="card animate-in" style={{ padding: '1rem', marginBottom: 0 }}>
        <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Monthly Limit</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.25rem' }}>{usage.monthly_limit?.toLocaleString()}</div>
      </div>
      <div className="card animate-in" style={{ padding: '1rem', marginBottom: 0 }}>
        <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Current Tier</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.25rem', textTransform: 'capitalize' }}>{usage.tier || 'Free'}</div>
      </div>
      <div className="card animate-in" style={{ padding: '1rem', marginBottom: 0 }}>
        <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Days Until Reset</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.25rem' }}>{usage.usage_reset_at ? Math.ceil((new Date(usage.usage_reset_at) - new Date()) / (1000 * 60 * 60 * 24)) : daysUntilReset()}</div>
      </div>
    </div>
  );
}
