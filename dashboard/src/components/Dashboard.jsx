import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL, PHISH_API_URL } from '../context';
import ApiKeyCard from './ApiKeyCard';
import UsageCard from './UsageCard';
import BillingCard from './BillingCard';
import CodePlayground from './CodePlayground';
import OpticParseSection from './OpticParseSection';
import PhishVisionSection from './PhishVisionSection';
import QuickTestSection from './QuickTestSection';
import BulkScannerSection from './BulkScannerSection';
import WatchDashboardSection from './WatchDashboardSection';
import QuickStatsBar from './QuickStatsBar';
import FeedbackModal from './FeedbackModal';
import LogsSection from './LogsSection';
import SettingsKeysSection from './SettingsKeysSection';
import IntegrationsSection from './IntegrationsSection';
import ExperimentalFeaturesSection from './ExperimentalFeaturesSection';

const Icons = {
  dashboard: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>,
  key: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  chart: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  credit: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  code: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  mail: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  logout: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
};

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const [page, setPage] = useState('dashboard')
  const [apiKey, setApiKey] = useState(null)
  const [usage, setUsage] = useState({ tier: 'free', monthly_limit: 100, current_usage: 0, usage_reset_at: null })
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)

  // Fetch usage and key on mount
  useEffect(() => {
    if (user?.id) {
      fetch(`${GATEWAY_URL}/gateway/usage/${user.id}`)
        .then(r => r.json())
        .then(setUsage)
        .catch(() => {})
        
      const savedKey = localStorage.getItem(`opticparse_apikey_${user.id}`)
      if (savedKey) {
        setApiKey(savedKey)
      } else {
        handleGenerateKey()
      }
    }
  }, [user])

  const handleGenerateKey = async () => {
    try {
      const res = await fetch(`${GATEWAY_URL}/gateway/keys/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, email: user.email }),
      })
      if (res.status === 400) {
        // Hit the 3 key limit, auto-regenerate instead to clear them
        await handleRegenerate(true)
        return
      }
      const data = await res.json()
      if (data.api_key) {
        setApiKey(data.api_key)
        localStorage.setItem(`opticparse_apikey_${user.id}`, data.api_key)
      }
    } catch (err) {
      console.error('Key generation failed:', err)
    }
  }

  const handleRegenerate = async (silent = false) => {
    if (!silent && !confirm('Are you sure? Your old key will stop working immediately.')) return;
    try {
      const response = await fetch(`${GATEWAY_URL}/gateway/keys/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ user_id: user.id })
      });
      if (!response.ok) throw new Error('Regenerate failed');
      const data = await response.json();
      setApiKey(data.api_key);
      localStorage.setItem(`opticparse_apikey_${user.id}`, data.api_key);
      if (!silent) alert('API key regenerated successfully!');
    } catch (err) {
      if (!silent) alert('Failed to regenerate key: ' + err.message);
    }
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.dashboard },
    { id: 'keys', label: 'Settings', icon: Icons.key },
    { id: 'usage', label: 'Usage', icon: Icons.chart },
    { id: 'billing', label: 'Billing', icon: Icons.credit },
    { id: 'integrations', label: 'Integrations', icon: Icons.code },
    { id: 'extensions', label: 'Extensions', icon: Icons.code },
    { id: 'docs', label: 'API Docs', icon: Icons.code },
    { id: 'playground', label: 'Code Playground', icon: Icons.code },
  ]

  const initial = user?.email?.charAt(0)?.toUpperCase() || '?'

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo" style={{fontSize: '1rem'}}>OpticParse & PhishVision</div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`sidebar-link ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="avatar">{user?.email?.charAt(0).toUpperCase()}</div>
            <div className="user-info">
              <span className="email">{user?.email}</span>
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <a href="https://opticparse.com" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--muted)', fontSize: '0.85rem', textDecoration: 'none', padding: '0.5rem', borderRadius: '4px' }}>
              ← Back to Website
            </a>
            <button className="sidebar-link" onClick={() => setIsFeedbackOpen(true)} style={{ color: 'var(--text)', background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
              {Icons.mail}
              Send Feedback
            </button>
            <button className="sidebar-link" onClick={signOut} style={{ color: 'var(--red)' }}>
              {Icons.logout}
              Sign Out
            </button>
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', fontSize: '0.75rem', justifyContent: 'center' }}>
            <a href="https://opticparse.com/privacy.html" target="_blank" rel="noreferrer" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Privacy Policy</a>
            <a href="https://opticparse.com/terms.html" target="_blank" rel="noreferrer" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Terms of Service</a>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {page === 'dashboard' && (
          <>
            <div className="page-header">
              <h1>OpticParse & PhishVision Dashboard</h1>
              <p>Welcome back. Here's your API overview.</p>
            </div>
            <QuickStatsBar usage={usage} />
            <div className="card-grid">
              <UsageCard usage={usage} user={user} apiKey={apiKey} />
              <BillingCard tier={usage.tier} userId={user?.id} />
            </div>
            <ApiKeyCard apiKey={apiKey} onRegenerate={handleRegenerate} />
            <OpticParseSection apiKey={apiKey} />
            <PhishVisionSection />
            <BulkScannerSection />
            <QuickTestSection apiKey={apiKey} />
            <WatchDashboardSection usage={usage} setPage={setPage} />
          </>
        )}

        {page === 'keys' && (
          <>
            <div className="page-header">
              <h1>API Keys & Security</h1>
              <p>Manage your API authentication credentials and environments.</p>
            </div>
            <SettingsKeysSection user={user} />
          </>
        )}

        {page === 'usage' && (
          <>
            <div className="page-header">
              <h1>Usage</h1>
              <p>Monitor your API consumption across services.</p>
            </div>
            <div className="card-grid">
              <UsageCard usage={usage} />
              <div className="card animate-in">
                <div className="card-label">Remaining Calls</div>
                <div className="card-value text-green">{Math.max(0, usage.monthly_limit - usage.current_usage).toLocaleString()}</div>
              </div>
            </div>
            <LogsSection user={user} />
          </>
        )}

        {page === 'billing' && (
          <>
            <div className="page-header">
              <h1>Billing</h1>
              <p>Manage your subscription and payment.</p>
            </div>
            <BillingCard tier={usage.tier} userId={user?.id} />
          </>
        )}

        {page === 'integrations' && (
          <>
            <div className="page-header">
              <h1>Integrations & Webhooks</h1>
              <p>Connect your APIs to external tools.</p>
            </div>
            <IntegrationsSection user={user} />
          </>
        )}

        {page === 'extensions' && (
          <>
            <div className="page-header">
              <h1>Experimental Features</h1>
              <p>Try out new tools in early access.</p>
            </div>
            <ExperimentalFeaturesSection />
          </>
        )}

        {page === 'playground' && (
          <>
            <div className="page-header">
              <h1>Code Playground</h1>
              <p>Copy-paste ready integration snippets with your API key.</p>
            </div>
            <CodePlayground apiKey={apiKey} />
          </>
        )}

        {page === 'docs' && (
          <>
            <div className="page-header">
              <h1>API Documentation</h1>
              <p>Quick start guides for OpticParse and PhishVision.</p>
            </div>
            <div className="card animate-in mb-2" style={{marginBottom: '1rem'}}>
              <div className="card-label">Example 1 — OpticParse (cURL)</div>
              <div className="code-block" style={{position:'relative'}}>
                <button className="code-copy" onClick={() => navigator.clipboard.writeText(`curl -X POST https://opticparse-python-sg.onrender.com/api/vision-scrape \\\n  -H "X-API-Key: ${apiKey || 'YOUR_API_KEY'}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "url": "https://example.com",\n    "query": "Extract main heading",\n    "response_schema": {"heading": "string"}\n  }'`)}>Copy</button>
                <pre style={{margin:0, fontSize:'0.85rem', color:'var(--text)', whiteSpace:'pre-wrap'}}>{`curl -X POST https://opticparse-python-sg.onrender.com/api/vision-scrape \\
  -H "X-API-Key: ${apiKey || 'YOUR_API_KEY'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com",
    "query": "Extract main heading",
    "response_schema": {"heading": "string"}
  }'`}</pre>
              </div>
            </div>
            
            <div className="card animate-in mb-2" style={{marginBottom: '1rem'}}>
              <div className="card-label">Example 2 — PhishVision (cURL)</div>
              <div className="code-block" style={{position:'relative'}}>
                <button className="code-copy" onClick={() => navigator.clipboard.writeText(`curl -X POST ${PHISH_API_URL}/api/phish-detect \\\n  -H "Content-Type: application/json" \\\n  -d '{"url": "https://suspicious-site.com"}'`)}>Copy</button>
                <pre style={{margin:0, fontSize:'0.85rem', color:'var(--text)', whiteSpace:'pre-wrap'}}>{`curl -X POST ${PHISH_API_URL}/api/phish-detect \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://suspicious-site.com"}'`}</pre>
              </div>
            </div>

            <div className="card animate-in mb-2">
              <div className="card-label">Example 3 — Python SDK style</div>
              <div className="code-block" style={{position:'relative'}}>
                <button className="code-copy" onClick={() => navigator.clipboard.writeText(`import requests\n\nresponse = requests.post(\n    "${GATEWAY_URL}/api/vision-scrape",\n    headers={"X-API-Key": "${apiKey || 'YOUR_API_KEY'}"},\n    json={\n        "url": "https://example.com",\n        "query": "Extract data",\n        "response_schema": {"data": "string"}\n    }\n)\nprint(response.json())`)}>Copy</button>
                <pre style={{margin:0, fontSize:'0.85rem', color:'var(--text)', whiteSpace:'pre-wrap'}}>{`import requests

response = requests.post(
    "${GATEWAY_URL}/api/vision-scrape",
    headers={"X-API-Key": "${apiKey || 'YOUR_API_KEY'}"},
    json={
        "url": "https://example.com",
        "query": "Extract data",
        "response_schema": {"data": "string"}
    }
)
print(response.json())`}</pre>
              </div>
            </div>
          </>
        )}
      </main>
      
      <FeedbackModal 
        isOpen={isFeedbackOpen} 
        onClose={() => setIsFeedbackOpen(false)} 
        user={user} 
      />
    </div>
  )
}
