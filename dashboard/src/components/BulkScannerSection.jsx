import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL, PHISH_API_URL } from '../context';

export default function BulkScannerSection({ apiKey }) {
  const [urls, setUrls] = useState('');
  const [prompt, setPrompt] = useState('Extract main content');
  const [apiChoice, setApiChoice] = useState('opticparse');
  const [results, setResults] = useState([]);
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    if (!urls.trim()) return;
    setScanning(true);
    setResults([]);
    const urlList = urls.split('\n').map(u => u.trim()).filter(Boolean).slice(0, 10);
    
    for (const url of urlList) {
      try {
        let res, data, finalVerdict, confidence;
        if (apiChoice === 'opticparse') {
          res = await fetch(`${GATEWAY_URL}/api/vision-scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey || 'YOUR_API_KEY' },
            body: JSON.stringify({ target_url: url, extraction_query: prompt, response_schema: { "content": "string" } })
          });
          const rawData = await res.json();
          // Try to stringify if it's an object, otherwise use the text
          finalVerdict = typeof rawData === 'string' ? rawData : JSON.stringify(rawData).substring(0, 50) + '...';
          confidence = 100;
        } else {
          res = await fetch(`${PHISH_API_URL}/api/phish-detect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });
          data = await res.json();
          finalVerdict = data.verdict;
          confidence = data.confidence_score_percentage;
        }
        setResults(prev => [...prev, { url, verdict: finalVerdict, confidence, time: new Date().toLocaleTimeString() }]);
      } catch (err) {
        setResults(prev => [...prev, { url, verdict: 'error', confidence: 0, time: new Date().toLocaleTimeString() }]);
      }
    }
    setScanning(false);
  };

  return (
    <div className="card mt-2 animate-in">
      <h2>Bulk Scanner</h2>
      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <select value={apiChoice} onChange={e => setApiChoice(e.target.value)} style={{padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: '#1a1a24', color: 'var(--text)', width: 'fit-content'}}>
          <option value="opticparse">OpticParse (Data Extraction)</option>
          <option value="phishvision">PhishVision (Security Scan)</option>
        </select>
        
        {apiChoice === 'opticparse' && (
          <input 
            type="text" 
            placeholder="Extraction Query (e.g. Extract the book title and price)" 
            value={prompt} 
            onChange={e => setPrompt(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', background: '#1a1a24', color: 'white' }}
          />
        )}
        
        <textarea 
          placeholder="Enter URLs (one per line, max 10)" 
          value={urls} 
          onChange={e => setUrls(e.target.value)}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', background: '#1a1a24', color: 'white', minHeight: '100px', resize: 'vertical' }}
        />
        <button className="btn btn-primary" onClick={handleScan} disabled={scanning} style={{ width: 'fit-content' }}>
          {scanning ? 'Scanning...' : 'Scan All URLs'}
        </button>
      </div>
      
      {results.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1rem', margin: 0 }}>Results</h3>
            <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }} onClick={() => {
              const headers = ["URL", "Verdict", "Confidence", "Time"];
              const rows = results.map(r => [r.url, r.verdict, r.confidence, r.time]);
              const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join("\n");
              const link = document.createElement("a");
              link.setAttribute("href", encodeURI(csvContent));
              link.setAttribute("download", `bulk_scan_results_${apiChoice}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}>
              Export CSV
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>URL</th>
                <th style={{ padding: '0.5rem' }}>Result</th>
                <th style={{ padding: '0.5rem' }}>Confidence</th>
                <th style={{ padding: '0.5rem' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '0.5rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.url}>{r.url}</td>
                  <td style={{ padding: '0.5rem', color: r.verdict === 'safe' ? 'var(--green)' : r.verdict === 'malicious' ? 'var(--red)' : 'var(--text)' }}>
                    {r.verdict?.toString().toUpperCase()}
                  </td>
                  <td style={{ padding: '0.5rem' }}>{r.confidence}%</td>
                  <td style={{ padding: '0.5rem', color: 'var(--muted)' }}>{r.time}</td>
                  <td style={{ padding: '0.5rem' }}>
                    {apiChoice === 'phishvision' && r.verdict !== 'error' && (
                      <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} onClick={() => window.open(`${PHISH_API_URL}/api/phish-report?url=${encodeURIComponent(r.url)}`, '_blank')}>
                        PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
