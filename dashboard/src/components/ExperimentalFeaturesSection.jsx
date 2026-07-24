import React from 'react';

export default function ExperimentalFeaturesSection() {
  return (
    <div className="card mt-2 animate-in">
      <h2 style={{color: 'var(--purple)'}}>Experimental Features & Extensions</h2>
      <p style={{color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.5rem'}}>
        We've just launched three powerful new ways to interact with our AI ecosystem. Download the extensions below to start using them.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        {/* BYOB Extractor */}
        <div style={{ background: '#1a1a24', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
          <div style={{ color: 'var(--cyan)', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>CHROME EXTENSION</div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>BYOB Extractor</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5 }}>
            Bring Your Own Browser. Install our Chrome extension, enter your API key, and instantly scrape any page you are currently viewing. Bypasses all bot protection since it runs in your own authenticated browser.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <a href="https://github.com/parastejpal987-cmyk/opticparse/tree/main/opticparse-extension" target="_blank" className="btn btn-outline" style={{ flex: 1, textAlign: 'center', fontSize: '0.8rem' }}>
              Download Extension
            </a>
          </div>
        </div>

        {/* Agentic Actions */}
        <div style={{ background: '#1a1a24', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
          <div style={{ color: 'var(--purple)', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>API INTEGRATION</div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Agentic Actions</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5 }}>
            Pass a list of click, fill, wait, and keypress commands directly in your JSON payload. OpticParse will execute these actions on the page before taking the screenshot, allowing you to dismiss popups and navigate UI.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-outline" style={{ flex: 1, textAlign: 'center', fontSize: '0.8rem' }} onClick={() => alert('Check the API Docs for the "actions" array format!')}>
              View Documentation
            </button>
          </div>
        </div>

        {/* PhishVision Sentinel */}
        <div style={{ background: '#1a1a24', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
          <div style={{ color: '#f43f5e', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>SECURITY EXTENSION</div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>PhishVision Sentinel</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5 }}>
            A lightweight Chrome extension that analyzes any active webpage against our PhishVision models with a single click. Detects sophisticated zero-day phishing pages and brand impersonations instantly.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <a href="https://github.com/parastejpal987-cmyk/opticparse/tree/main/phishvision-extension" target="_blank" className="btn btn-outline" style={{ flex: 1, textAlign: 'center', fontSize: '0.8rem' }}>
              Download Extension
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
