import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL, PHISH_API_URL } from '../context';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function QuickTestSection({ apiKey }) {
  const [url, setUrl] = useState('');
  const [apiChoice, setApiChoice] = useState('opticparse');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState(false);

  const [schemaStr, setSchemaStr] = useState('{"content": "string"}');
  const [schemas, setSchemas] = useState(JSON.parse(localStorage.getItem('opticparse_schemas') || '[]'));

  const saveSchema = () => {
    try {
      JSON.parse(schemaStr); // validate
      const name = prompt("Enter a name for this schema:");
      if (!name) return;
      const newSchemas = [...schemas, { name, schema: schemaStr }];
      setSchemas(newSchemas);
      localStorage.setItem('opticparse_schemas', JSON.stringify(newSchemas));
    } catch (e) {
      alert("Invalid JSON schema!");
    }
  };

  const exportOpticParsePDF = async () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(22);
      doc.setTextColor(37, 99, 235); // #2563eb
      doc.text("OpticParse Data Extraction Report", 20, 20);
      
      doc.setFontSize(12);
      doc.setTextColor(51, 51, 51); // #333
      doc.text(`Target URL: ${url}`, 20, 35);
      doc.text(`Date: ${new Date().toLocaleString()}`, 20, 45);
      
      doc.setFontSize(16);
      doc.text("Extracted Data:", 20, 60);
      
      doc.setFontSize(10);
      const splitText = doc.splitTextToSize(result, 170);
      doc.text(splitText, 20, 75);
      
      doc.save(`opticparse-report-${Date.now()}.pdf`);
    } catch (e) {
      console.error("PDF generation failed", e);
      alert("Failed to generate PDF");
    }
  };

  const runTest = async () => {
    if (!url) return alert('Please enter a URL');
    setLoading(true);
    setResult('Running test...');
    try {
      let res;
      if (apiChoice === 'opticparse') {
        res = await fetch(`${GATEWAY_URL}/api/vision-scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
          body: JSON.stringify({ target_url: url, extraction_query: 'Extract data based on schema', response_schema: JSON.parse(schemaStr) })
        });
      } else {
        res = await fetch(`${PHISH_API_URL}/api/phish-detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, dry_run: dryRun })
        });
      }
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setResult('Error: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="card mt-2">
      <h2>Quick Test & Schema Library</h2>
      <div className="flex gap-1" style={{marginTop: '1rem', flexDirection: 'column'}}>
        <input type="url" placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} style={{padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: '#1a1a24', color: 'var(--text)'}} />
        <select value={apiChoice} onChange={e => setApiChoice(e.target.value)} style={{padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: '#1a1a24', color: 'var(--text)'}}>
          <option value="opticparse">OpticParse (Custom Extraction)</option>
          <option value="phishvision">PhishVision (Security Scan)</option>
        </select>
        
        {apiChoice === 'opticparse' && (
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select onChange={e => e.target.value && setSchemaStr(e.target.value)} style={{flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: '#1a1a24', color: 'var(--text)'}}>
                <option value="">-- Load Saved Schema --</option>
                {schemas.map((s, i) => <option key={i} value={s.schema}>{s.name}</option>)}
              </select>
              <button className="btn btn-outline" onClick={saveSchema}>Save Current Schema</button>
            </div>
            <textarea 
              value={schemaStr} 
              onChange={e => setSchemaStr(e.target.value)} 
              placeholder="Enter JSON Schema..."
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: '#1a1a24', color: 'white', minHeight: '100px', resize: 'vertical', fontFamily: 'monospace' }}
            />
          </div>
        )}

        {apiChoice === 'phishvision' && (
          <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" id="dryRun" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
            <label htmlFor="dryRun" style={{ fontSize: '0.85rem', color: 'var(--text)' }}>Dry Run (skip AI, return raw telemetry)</label>
          </div>
        )}
        
        <button className="btn btn-primary" onClick={runTest} disabled={loading}>{loading ? 'Testing...' : 'Run Test'}</button>
      </div>
      {result && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ background: '#000', padding: '1rem', borderRadius: '8px', maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
            <pre style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{result}</pre>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {apiChoice === 'phishvision' && !result.startsWith('Error:') && (
              <button className="btn btn-outline" onClick={() => window.open(`${PHISH_API_URL}/api/phish-report?url=${encodeURIComponent(url)}`, '_blank')}>
                Download PDF Report
              </button>
            )}
            {apiChoice === 'opticparse' && !result.startsWith('Error:') && (
              <button className="btn btn-outline" onClick={exportOpticParsePDF}>
                Download OpticParse PDF
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
