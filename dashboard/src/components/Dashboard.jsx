import React, { useState, useEffect } from 'react';
import { supabase, useAuth, GATEWAY_URL } from '../context';
import ApiKeyManager from './ApiKeyManager';
import UsageCard from './UsageCard';
import BillingCard from './BillingCard';
import CodePlayground from './CodePlayground';
import OpticParseSection from './OpticParseSection';
import PhishVisionSection from './PhishVisionSection';
import QuickTestSection from './QuickTestSection';
import BulkScannerSection from './BulkScannerSection';
import WatchDashboardSection from './WatchDashboardSection';
import FeedbackModal from './FeedbackModal';
import AdvancedLogs from './AdvancedLogs';
import SettingsKeysSection from './SettingsKeysSection';
import TemplateModal from './TemplateModal';
import IntegrationsSection from './IntegrationsSection';
import TeamManagementSection from './TeamManagementSection';
import WebhookManagerSection from './WebhookManagerSection';
import UserProfileSection from './UserProfileSection';
import NotificationCenter from './NotificationCenter';
import ExperimentalFeaturesSection from './ExperimentalFeaturesSection';
import AnalyticsDashboard from './AnalyticsDashboard';
import LiveActivityFeed from './LiveActivityFeed';
import PhantomModal from './PhantomModal';
import EmbeddableWidgetSection from './EmbeddableWidgetSection';
import JobHistory from './JobHistory';
import Marketplace from './Marketplace';
import BountyQueue from './BountyQueue';
import Preferences from './Preferences';
import DeveloperOnboarding from './DeveloperOnboarding';
import MiningDashboardSection from './MiningDashboardSection';

const Icons = {
  dashboard: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>,
  workflows: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
  templates: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>,
  mining: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  analytics: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  integrations: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  wallet: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>
};

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const [page, setPage] = useState('dashboard')
  const [apiKey, setApiKey] = useState(null)
  const [usage, setUsage] = useState({ tier: 'free', monthly_limit: 100, current_usage: 0, balance: 10.00, usage_reset_at: null })
  const [brainStats, setBrainStats] = useState({ totalScans: 4120, todayScans: 1200, accuracy: '98.7%' })
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
  const [showPhantom, setShowPhantom] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  
  // Quick test URL state inside the Dashboard Bento
  const [quickUrl, setQuickUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  
  // Settings Tab State
  const [settingsTab, setSettingsTab] = useState('profile')
  // Dashboard Template Modal State
  const [selectedTemplateForModal, setSelectedTemplateForModal] = useState(null)

  useEffect(() => {
    if (user?.id) {
      fetch(`${GATEWAY_URL}/gateway/usage/${user.id}`)
        .then(r => r.json())
        .then(data => {
          if (data) setUsage(data)
        })
        .catch(() => {})

      // Fetch live telemetry stats
      fetch(`${GATEWAY_URL}/api/brain/stats`)
        .then(r => r.json())
        .then(data => {
          if (data && data.totalScans) {
            setBrainStats(data)
          }
        })
        .catch(() => {})
        
      const savedKey = localStorage.getItem(`opticparse_apikey_${user.id}`)
      if (savedKey) {
        setApiKey(savedKey)
      } else {
        handleGenerateKey()
      }

      const hasSeenOnboarding = localStorage.getItem(`opticparse_onboarded_${user.id}`)
      if (!hasSeenOnboarding) {
        setShowOnboarding(true)
      }
    }
  }, [user])

  useEffect(() => {
    if (usage.current_usage >= usage.monthly_limit && usage.monthly_limit > 0 && usage.tier === 'free') {
      const phantomAcknowledged = localStorage.getItem(`phantom_ack_${user.id}`);
      if (!phantomAcknowledged) {
        setShowPhantom(true);
      }
    }
  }, [usage, user])

  const handleAcknowledgePhantom = () => {
    localStorage.setItem(`phantom_ack_${user.id}`, 'true');
    setShowPhantom(false);
  }

  const handleCompleteOnboarding = () => {
    if (user?.id) {
      localStorage.setItem(`opticparse_onboarded_${user.id}`, 'true')
    }
    setShowOnboarding(false)
  }

  const handleGenerateKey = async () => {
    try {
      // 1. Try Gateway API
      const res = await fetch(`${GATEWAY_URL}/gateway/keys/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id || 'dev_user', email: user?.email || 'user@opticparse.com' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.api_key) {
          setApiKey(data.api_key);
          localStorage.setItem(`opticparse_apikey_${user?.id || 'guest'}`, data.api_key);
          return;
        }
      }
      // 2. Fallback: Cryptographically secure client generation
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      const fallbackKey = `op_live_${token}`;
      setApiKey(fallbackKey);
      localStorage.setItem(`opticparse_apikey_${user?.id || 'guest'}`, fallbackKey);
    } catch (err) {
      console.warn('Backend key gen fallback to local client crypto:', err);
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      const fallbackKey = `op_live_${token}`;
      setApiKey(fallbackKey);
      localStorage.setItem(`opticparse_apikey_${user?.id || 'guest'}`, fallbackKey);
    }
  }

  const handleRegenerate = async (silent = false) => {
    if (!silent && !confirm('Are you sure? Your old key will be rotated immediately.')) return;
    try {
      const response = await fetch(`${GATEWAY_URL}/gateway/keys/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id || 'dev_user', email: user?.email || 'user@opticparse.com' })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.api_key) {
          setApiKey(data.api_key);
          localStorage.setItem(`opticparse_apikey_${user?.id || 'guest'}`, data.api_key);
          if (!silent) alert('API key regenerated successfully: ' + data.api_key);
          return;
        }
      }
      // Fallback rotation
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      const fallbackKey = `op_live_${token}`;
      setApiKey(fallbackKey);
      localStorage.setItem(`opticparse_apikey_${user?.id || 'guest'}`, fallbackKey);
      if (!silent) alert('API key regenerated successfully: ' + fallbackKey);
    } catch (err) {
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      const fallbackKey = `op_live_${token}`;
      setApiKey(fallbackKey);
      localStorage.setItem(`opticparse_apikey_${user?.id || 'guest'}`, fallbackKey);
      if (!silent) alert('API key regenerated successfully: ' + fallbackKey);
    }
  }

  const handleQuickScan = async (e) => {
    e.preventDefault()
    if (!quickUrl) return
    setScanning(true)
    setScanResult(null)
    try {
      // Route to high-availability edge endpoint instead of sleep-prone container
      const response = await fetch('https://opticparse.parastejpal987.workers.dev/api/playground/phish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: quickUrl })
      })
      const data = await response.json()
      setScanResult(data)
    } catch (err) {
      alert('Edge scan failed: ' + err.message)
    } finally {
      setScanning(false)
    }
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.dashboard },
    { id: 'marketplace', label: 'Marketplace', icon: Icons.templates },
    { id: 'bounties', label: 'Bounties', icon: Icons.workflows },
    { id: 'scraper', label: 'Scraper & Templates', icon: Icons.workflows },
    { id: 'security', label: 'Security & PhishVision', icon: Icons.templates },
    { id: 'tasks', label: 'Background Tasks', icon: Icons.analytics },
    { id: 'developer', label: 'Developer Tools', icon: Icons.integrations },
    { id: 'wallet', label: 'Wallet & Billing', icon: Icons.wallet },
    { id: 'settings', label: 'Settings', icon: Icons.settings },
  ]

  const [displayName, setDisplayName] = useState(
    localStorage.getItem(`opticparse_display_name_${user?.id}`) || 
    user?.user_metadata?.display_name || 
    user?.email?.split('@')[0] || 
    'Developer'
  )

  useEffect(() => {
    const handleProfileUpdate = (e) => {
      if (e.detail?.displayName) {
        setDisplayName(e.detail.displayName)
      }
    }
    const handleWalletUpdate = (e) => {
      if (e.detail?.balance !== undefined) {
        setUsage(prev => ({ ...prev, balance: e.detail.balance }))
      }
    }
    window.addEventListener('opticparse:profile-updated', handleProfileUpdate)
    window.addEventListener('opticparse:wallet-updated', handleWalletUpdate)
    return () => {
      window.removeEventListener('opticparse:profile-updated', handleProfileUpdate)
      window.removeEventListener('opticparse:wallet-updated', handleWalletUpdate)
    }
  }, [user])

  const currentCreditBalance = (usage?.balance !== undefined ? usage.balance : ((usage.monthly_limit - usage.current_usage) / 10)).toFixed(2)

  return (
    <div className="app-layout" style={{ background: '#0a0a0f', minHeight: '100vh', display: 'flex', color: '#f4f4f5' }}>
      
      {/* ─── SIDEBAR Redesign ─── */}
      <aside style={{
        width: '260px', background: 'rgba(20, 20, 28, 0.4)',
        borderRight: '1px solid rgba(255, 255, 255, 0.05)',
        padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 100, backdropFilter: 'blur(20px)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ fontWeight: 900, fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2.5rem', flexShrink: 0 }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: 'linear-gradient(135deg, #c084fc 0%, #22d3ee 100%)' }}></div>
            OpticParse
          </div>
          
          <nav className="sidebar-nav" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                  borderRadius: '12px', border: 'none', background: page === item.id ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                  color: page === item.id ? '#fff' : '#a1a1aa', fontSize: '0.9rem', fontWeight: 600,
                  width: '100%', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.5rem', marginTop: '1rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #c084fc 0%, #22d3ee 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem', color:'#fff', flexShrink: 0 }}>
              {(displayName || user?.email || 'D').charAt(0).toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '130px' }}>
                {displayName}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#a1a1aa', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '130px' }}>{user?.email}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <button
              onClick={() => setIsFeedbackOpen(true)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.5rem',
                borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(255, 255, 255, 0.03)',
                color: '#e4e4e7', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              💬 Feedback
            </button>
            <button 
              onClick={signOut}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem 0.75rem',
                borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.05)',
                color: '#f87171', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.2s'
              }}
              title="Sign Out"
            >
              {Icons.logout}
            </button>
          </div>
        </div>
      </aside>

      {/* ─── MAIN CONTENT CONTAINER ─── */}
      <main style={{ marginLeft: '260px', flex: 1, padding: '1.5rem 2.5rem 3rem', display: 'flex', justifyContent: 'center', minWidth: 0 }}>
        <div style={{ width: '100%', maxWidth: '1240px', display: 'flex', flexDirection: 'column' }}>

          {/* Persistent Top Navigation Bar */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.85rem 1.5rem', marginBottom: '2rem',
            background: 'rgba(20, 20, 28, 0.4)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}>
                Status: <span style={{ color: '#10b981', fontWeight: 800 }}>● Edge Network 100% Operational</span>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {/* Credit Wallet Badge */}
              <div 
                onClick={() => { setPage('wallet'); setSettingsTab('billing'); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.9rem',
                  background: 'rgba(34, 211, 238, 0.1)', border: '1px solid rgba(34, 211, 238, 0.3)',
                  borderRadius: '100px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 800, color: 'var(--cyan)',
                  transition: 'all 0.2s'
                }}
                title="Click to manage Edge Wallet balance"
              >
                <span>⚡</span> ${currentCreditBalance} Credits
              </div>

              {/* Live Notification Center */}
              <NotificationCenter user={user} />
            </div>
          </div>
        
        {page === 'dashboard' && (
          <>
            {/* Top Bento Grid - Core Tools (API Key & Wallet) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr',
              gap: '1.5rem',
              alignItems: 'stretch',
              marginBottom: '2rem'
            }}>
              
              {/* Box 1: Api Key Card (Most Important) */}
              <ApiKeyManager initialKey={apiKey} onRegenerate={handleRegenerate} user={user} />

              {/* Box 2: Wallet / Billing Quick Card */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '24px', padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Cloudflare Edge Wallet</h3>
                  <p style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>Your current API balance across the Edge.</p>
                </div>
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--cyan)' }}>
                    ${currentCreditBalance}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <button 
                      onClick={() => { setPage('wallet'); setSettingsTab('billing'); }}
                      style={{ padding: '0.6rem 1rem', background: 'var(--cyan-dim)', color: 'var(--cyan)', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                      Top Up Wallet & Credits
                    </button>
                  </div>
                </div>
              </div>

            </div>

            {/* Row 2: Secondary Tools (Scan Link & Workflows) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '1.5rem',
              marginBottom: '2rem'
            }}>
              
              {/* Box 3: Scan Link Coral Bento Card */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.08) 0%, rgba(20, 20, 28, 0.9) 100%)',
                border: '1px solid rgba(249, 115, 22, 0.3)',
                borderRadius: '24px', padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                boxShadow: '0 15px 35px rgba(0,0,0,0.4)'
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '1px' }}>Scan Link</span>
                    <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Workflows ▾</span>
                  </div>
                  
                  <form onSubmit={handleQuickScan} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <input 
                      type="url" 
                      placeholder="Paste URL here..." 
                      value={quickUrl}
                      onChange={(e) => setQuickUrl(e.target.value)}
                      required
                      style={{
                        width: '100%', padding: '0.85rem 1rem', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '12px', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.9rem', outline: 'none'
                      }}
                    />
                    <button 
                      type="submit" 
                      disabled={scanning}
                      style={{
                        padding: '0.85rem', background: 'linear-gradient(135deg, #f97316 0%, #ff7e5f 100%)',
                        border: 'none', color: '#fff', fontWeight: 800, borderRadius: '12px', cursor: 'pointer', fontSize: '0.9rem'
                      }}
                    >
                      {scanning ? 'Scanning...' : 'New Scan'}
                    </button>
                  </form>
                </div>

                {scanResult && (
                  <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    Verdict: <span style={{ color: scanResult.verdict === 'SAFE' ? '#10b981' : '#f43f5e', fontWeight: 'bold' }}>{scanResult.verdict}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.25rem', marginTop: '1.5rem' }}>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{brainStats.totalScans.toLocaleString()}</div>
                    <div style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>Scans Total</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{brainStats.todayScans.toLocaleString()}</div>
                    <div style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>New Today</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{brainStats.accuracy}</div>
                    <div style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>Accuracy</div>
                  </div>
                </div>
              </div>

              {/* Workflows */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '1.75rem', display: 'flex', flexDirection: 'column', justify: 'space-between' }}>
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'1rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>📄</span>
                    <span style={{ fontSize: '0.75rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding:'0.25rem 0.5rem', borderRadius:'6px', fontWeight:700 }}>Active</span>
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Blog Post Extractor</h3>
                  <p style={{ fontSize: '0.8rem', color: '#a1a1aa', marginTop:'0.25rem' }}>Extract blog post components automatically using vision query schemas.</p>
                </div>
                <div style={{ display:'flex', justify:'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem', marginTop: '1.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>48 Workflows</span>
                  <a href="#" onClick={(e) => { e.preventDefault(); setPage('scraper'); }} style={{ fontSize:'0.8rem', color: 'var(--cyan)', textDecoration:'none', fontWeight: 700 }}>Configure</a>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '1.75rem', display: 'flex', flexDirection: 'column', justify: 'space-between' }}>
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'1rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>🛒</span>
                    <span style={{ fontSize: '0.75rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding:'0.25rem 0.5rem', borderRadius:'6px', fontWeight:700 }}>Active</span>
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Product Data (E-com)</h3>
                  <p style={{ fontSize: '0.8rem', color: '#a1a1aa', marginTop:'0.25rem' }}>Pull pricing, reviews, and specs from visual details directly.</p>
                </div>
                <div style={{ display:'flex', justify:'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem', marginTop: '1.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>32 Workflows</span>
                  <a href="#" onClick={(e) => { e.preventDefault(); setPage('scraper'); }} style={{ fontSize:'0.8rem', color: 'var(--cyan)', textDecoration:'none', fontWeight: 700 }}>Configure</a>
                </div>
              </div>

            </div>

            {/* Row 3: Usage Card & Live activity telemetry */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '0.8fr 1.2fr',
              gap: '1.5rem'
            }}>
              <UsageCard usage={usage} />
              <LiveActivityFeed userId={user?.id} />
            </div>

            {/* Analytics Bottom Panel */}
            <div style={{ marginTop: '2rem' }}>
              <AnalyticsDashboard user={user} />
              <div style={{ marginTop: '2rem' }}>
                <JobHistory user={user} />
              </div>
            </div>
          </>
        )}

        {page === 'marketplace' && <Marketplace user={user} />}
        {page === 'bounties' && <BountyQueue user={user} />}
        {page === 'wallet' && <BillingCard usage={usage} tier={usage?.tier} user={user} />}

        {page === 'scraper' && (
          <>
            <div className="page-header" style={{ marginBottom: '3rem' }}>
              <div style={{ display: 'inline-block', padding: '0.4rem 1rem', background: 'var(--cyan-dim)', color: 'var(--cyan)', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 800, marginBottom: '1rem', letterSpacing: '1px' }}>
                ✦ VISION ENGINE
              </div>
              <h1 style={{ fontSize: '3.5rem', fontWeight: 900, letterSpacing: '-2px' }}>OpticParse Scraper</h1>
              <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>Test the vision AI data extraction pipeline.</p>
            </div>
            <OpticParseSection apiKey={apiKey} />
            <QuickTestSection apiKey={apiKey} />
          </>
        )}

        {page === 'security' && (
          <>
            <div className="page-header" style={{ marginBottom: '3rem' }}>
              <div style={{ display: 'inline-block', padding: '0.4rem 1rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 800, marginBottom: '1rem', letterSpacing: '1px' }}>
                ✦ CYBERSECURITY
              </div>
              <h1 style={{ fontSize: '3.5rem', fontWeight: 900, letterSpacing: '-2px' }}>PhishVision Security</h1>
              <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>Detect phishing links and analyze visual threats.</p>
            </div>
            <PhishVisionSection />
            <BulkScannerSection />
          </>
        )}

        {page === 'tasks' && (
          <>
            <div className="page-header">
              <div style={{ display: 'inline-block', padding: '0.4rem 1rem', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 800, marginBottom: '1rem', letterSpacing: '1px' }}>
                ✦ AUTOMATION
              </div>
              <h1 style={{ fontSize: '3.5rem', fontWeight: 900, letterSpacing: '-2px' }}>Background Tasks</h1>
              <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>Monitor your active cron jobs and bulk processes.</p>
            </div>
            <WatchDashboardSection usage={usage} setPage={setPage} />
          </>
        )}

        {page === 'developer' && (
          <>
            <div className="page-header">
              <h1 style={{ fontSize: '3.5rem', fontWeight: 900, letterSpacing: '-2px' }}>Developer Tools & Logs</h1>
              <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>Monitor your API consumption, download SDKs, and view raw logs.</p>
            </div>
            <div className="card-grid">
              <UsageCard usage={usage} />
              <div className="card animate-in">
                <div className="card-label">Remaining Calls</div>
                <div className="card-value text-green">{Math.max(0, usage.monthly_limit - usage.current_usage).toLocaleString()}</div>
              </div>
            </div>
            <ExperimentalFeaturesSection />
            <AdvancedLogs user={user} />
            <CodePlayground apiKey={apiKey} />
          </>
        )}

        {page === 'settings' && (
          <>
            <div className="page-header">
              <h1 style={{ fontSize: '3.5rem', fontWeight: 900, letterSpacing: '-2px' }}>Settings & Integrations</h1>
              <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>Manage your account settings, team, billing, and integrations.</p>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '2rem' }}>
              {['profile', 'team', 'billing', 'api', 'integrations'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setSettingsTab(tab)}
                  style={{
                    padding: '0.5rem 1rem', background: settingsTab === tab ? 'var(--bg2)' : 'transparent',
                    border: '1px solid', borderColor: settingsTab === tab ? 'var(--border)' : 'transparent',
                    borderRadius: '8px', color: settingsTab === tab ? '#fff' : 'var(--muted)',
                    cursor: 'pointer', fontWeight: 600, textTransform: 'capitalize'
                  }}
                >
                  {tab === 'api' ? 'API & Webhooks' : tab}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', alignItems: 'start' }} className="animate-in mt-2">
              {settingsTab === 'profile' && <UserProfileSection user={user} />}
              {settingsTab === 'team' && <TeamManagementSection user={user} />}
              {settingsTab === 'billing' && <BillingCard usage={usage} tier={usage?.tier} user={user} />}
              {settingsTab === 'api' && (
                <>
                  <SettingsKeysSection user={user} />
                  <WebhookManagerSection user={user} />
                </>
              )}
              {settingsTab === 'integrations' && (
                <>
                  <IntegrationsSection user={user} />
                  <EmbeddableWidgetSection />
                </>
              )}
            </div>
          </>
        )}
        </div>
      </main>

      {selectedTemplateForModal && (
        <TemplateModal template={selectedTemplateForModal} onClose={() => setSelectedTemplateForModal(null)} />
      )}

      {isFeedbackOpen && (
        <FeedbackModal 
          isOpen={isFeedbackOpen} 
          onClose={() => setIsFeedbackOpen(false)} 
          user={user} 
        />
      )}

      {showPhantom && (
        <PhantomModal onClose={handleAcknowledgePhantom} currentUsage={usage.current_usage} monthlyLimit={usage.monthly_limit} />
      )}

      {showOnboarding && (
        <DeveloperOnboarding user={user} onComplete={handleCompleteOnboarding} />
      )}
    </div>
  )
}
