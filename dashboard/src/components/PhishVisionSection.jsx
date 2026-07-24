import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL, PHISH_API_URL } from '../context';

export default function PhishVisionSection() {
  const curl = `curl -X POST ${PHISH_API_URL}/api/phish-detect \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://suspicious-site.com", "dry_run": false}'`;
  return (
    <div className="card mt-2">
      <h2>PhishVision — Visual Phishing Detection</h2>
      <p style={{fontFamily: 'monospace', color: 'var(--cyan)'}}>POST {PHISH_API_URL}/api/phish-detect</p>
      <div style={{ background: '#000', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>
        <pre style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{curl}</pre>
      </div>
      <a href="https://opticparse.com" target="_blank" rel="noreferrer" className="btn btn-outline" style={{marginTop: '1rem', display: 'inline-block'}}>View Landing Page</a>
    </div>
  )
}
