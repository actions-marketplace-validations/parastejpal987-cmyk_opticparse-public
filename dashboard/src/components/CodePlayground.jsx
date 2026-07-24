import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';

export default function CodePlayground({ apiKey }) {
  const [tab, setTab] = useState('python')
  const key = apiKey || 'YOUR_API_KEY'
  
  // Local Mode State
  const [isLocalMode, setIsLocalMode] = useState(false)
  const [localProgress, setLocalProgress] = useState('')
  const [isModelLoaded, setIsModelLoaded] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  
  // Interactive Run State
  const [testPrompt, setTestPrompt] = useState('Extract main headings from this text...')
  const [testImage, setTestImage] = useState('') // Optional image URL or base64
  const [result, setResult] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  const snippets = {
    python: `import requests

response = requests.post(
    "https://opticparse-api.onrender.com/api/vision-scrape",
    headers={"X-API-Key": "${key}"},
    json={
        "target_url": "https://example.com",
        "extraction_query": "Extract all product names and prices as JSON",
        "proxy_url": "http://username:password@proxy.com:8000", # Optional: bypass bot detection
        "vision_mode": False # Optional: fast-path text mode
    }
)

print(response.json())`,
    sdk: `# Install SDK: pip install opticparse-py
from opticparse import OpticParseClient

client = OpticParseClient(api_key="${key}")

# 1. Vision Scrape
data = client.scrape(
    target_url="https://example.com", 
    extraction_query="Get main headings",
    proxy_url="http://username:password@proxy.com:8000", # Optional
    vision_mode=True # Optional
)
print(data)

# 2. PhishVision Threat Detection
threat = client.detect_phishing(
    "https://google.com",
    proxy_url="http://username:password@proxy.com:8000" # Optional
)
print(threat.verdict)`,
    mcp: `{
  "mcpServers": {
    "opticparse": {
      "command": "python",
      "args": ["-m", "mcp_server"],
      "env": {
        "OPTICPARSE_API_KEY": "${key}"
      }
    }
  }
}`,
    phishvision: `curl -X POST https://opticparse-api.onrender.com/api/phish-detect \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${key}" \\
  -d '{
    "url": "https://example.com",
    "proxy_url": "http://username:password@proxy.com:8000"
  }'`,
    curl: `curl -X POST https://opticparse-api.onrender.com/api/vision-scrape \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${key}" \\
  -d '{
    "target_url": "https://example.com",
    "extraction_query": "Extract all product names and prices as JSON",
    "proxy_url": "http://username:password@proxy.com:8000",
    "vision_mode": false
  }'`,
  }

  const copySnippet = () => {
    navigator.clipboard.writeText(snippets[tab])
  }

  const handleToggleLocal = async (e) => {
    const checked = e.target.checked;
    setIsLocalMode(checked);
    if (checked && !isModelLoaded) {
      setIsInitializing(true);
      try {
        await initLocalEngine((progress) => {
          setLocalProgress(progress.text);
        });
        setIsModelLoaded(true);
        setLocalProgress('Model loaded successfully!');
      } catch (err) {
        if (err.message === "WEBGPU_UNSUPPORTED") {
          setLocalProgress('WebGPU unsupported by your browser. Falling back to cloud API...');
        } else {
          setLocalProgress('Failed to load local model.');
          console.error(err);
        }
        setIsLocalMode(false);
      } finally {
        setIsInitializing(false);
      }
    }
  }

  const handleRun = async () => {
    setIsRunning(true);
    setResult('Running...');
    try {
      const payload = testImage ? { prompt: testPrompt, image: testImage } : testPrompt;
      const res = await routeInference(payload, isLocalMode, GATEWAY_URL, key);
      setResult(JSON.stringify(res, null, 2));
    } catch (err) {
      setResult('Error: ' + err.message);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="card animate-in" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem 1.5rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="card-label">Interactive Playground</div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <input 
              type="checkbox" 
              checked={isLocalMode} 
              onChange={handleToggleLocal}
              disabled={isInitializing}
            />
            Run Locally (Zero-Cost WebLLM)
          </label>
        </div>
      </div>
      
      {isInitializing && (
        <div style={{ padding: '0.5rem 1.5rem', fontSize: '0.8rem', color: 'var(--cyan)' }}>
          Loading Model: {localProgress}
        </div>
      )}
      {isModelLoaded && isLocalMode && (
        <div style={{ padding: '0.5rem 1.5rem', fontSize: '0.8rem', color: 'var(--green)' }}>
          Local Model Ready. Text queries will be processed in-browser.
        </div>
      )}

      {/* Interactive Run Section */}
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input 
            type="text" 
            placeholder="Image URL (optional, triggers Vision Backend)" 
            value={testImage} 
            onChange={e => setTestImage(e.target.value)} 
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg1)', color: 'var(--text)' }}
          />
          <textarea 
            placeholder="Enter prompt..." 
            value={testPrompt} 
            onChange={e => setTestPrompt(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg1)', color: 'var(--text)', minHeight: '60px' }}
          />
          <button 
            onClick={handleRun} 
            disabled={isRunning || (isLocalMode && !isModelLoaded)}
            className="btn btn-primary" 
            style={{ width: 'fit-content' }}
          >
            {isRunning ? 'Running...' : 'Run Inference'}
          </button>
          
          {result && (
            <pre style={{ background: '#000', padding: '1rem', borderRadius: '8px', fontSize: '0.8rem', overflowX: 'auto', border: '1px solid var(--border)' }}>
              {result}
            </pre>
          )}
        </div>
      </div>

      {/* Existing Snippets Section */}
      <div style={{ padding: '1.25rem 1.5rem 0' }}>
        <div className="card-label">Integration Snippets</div>
      </div>
      <div style={{ padding: '0 1.5rem' }}>
        <div className="code-tabs">
          {['python', 'sdk', 'mcp', 'phishvision', 'curl'].map(t => (
            <button key={t} className={`code-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'python' ? 'Python REST' : t === 'sdk' ? 'Python SDK' : t === 'mcp' ? 'MCP Server' : t === 'phishvision' ? 'PhishVision API' : 'cURL'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '0 1.5rem 1.5rem' }}>
        <div className="code-block">
          <button className="code-copy" onClick={copySnippet}>Copy</button>
          {snippets[tab]}
        </div>
      </div>
    </div>
  )
}
