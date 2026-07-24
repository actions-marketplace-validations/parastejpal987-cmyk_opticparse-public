import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';

export default function OpticParseSection({ apiKey }) {
  const curl = `curl -X POST https://opticparse-python-sg.onrender.com/api/vision-scrape \\
  -H "X-API-Key: ${apiKey || 'YOUR_API_KEY'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "target_url": "https://news.ycombinator.com",
    "extraction_query": "Extract top 5 post titles",
    "response_schema": {
      "posts": [{"title": "string"}]
    }
  }'`;
  return (
    <div className="card mt-2">
      <h2>OpticParse — Vision Web Scraper</h2>
      <p style={{fontFamily: 'monospace', color: 'var(--cyan)'}}>POST https://opticparse-python-sg.onrender.com/api/vision-scrape</p>
      <div style={{ background: '#000', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>
        <pre style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{curl}</pre>
      </div>
      <a href="https://opticparse.com" target="_blank" rel="noreferrer" className="btn btn-outline" style={{marginTop: '1rem', display: 'inline-block'}}>View Landing Page</a>
    </div>
  )
}
