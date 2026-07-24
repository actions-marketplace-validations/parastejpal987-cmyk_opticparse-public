import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';

export default function BillingCard({ tier, userId }) {
  const handleUpgrade = (planId) => {
    // Open Lemon Squeezy checkout with user_id in custom_data
    const url = `${LEMON_CHECKOUT_URL}?checkout[custom][user_id]=${userId}&checkout[custom][plan]=${planId}`
    window.open(url, '_blank')
  }

  const handlePortal = () => {
    // Mock customer portal url
    alert("Redirecting to LemonSqueezy Customer Portal... (requires backend API token)");
  }

  return (
    <div className="card mt-2 animate-in">
      <h2>Subscription & Billing</h2>
      <p style={{color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem'}}>
        Manage your current plan, view invoice history, and upgrade limits.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
        {/* Free Plan */}
        <div style={{ padding: '1.5rem', background: tier === 'free' ? 'rgba(37,99,235,0.1)' : 'var(--bg1)', borderRadius: '8px', border: `1px solid ${tier === 'free' ? 'var(--blue)' : 'var(--border)'}` }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Free Tier</div>
          <div style={{ fontSize: '1.5rem', margin: '0.5rem 0', fontWeight: 'bold' }}>$0 <span style={{fontSize: '0.9rem', color: 'var(--muted)'}}>/mo</span></div>
          <ul style={{ paddingLeft: '1.5rem', color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            <li>100 API Calls / month</li>
            <li>Community Support</li>
            <li>1 Active Monitor</li>
          </ul>
          {tier === 'free' ? (
            <button className="btn btn-primary" style={{ width: '100%' }} disabled>Current Plan</button>
          ) : (
            <button className="btn btn-outline" style={{ width: '100%' }}>Downgrade</button>
          )}
        </div>

        {/* Pro Plan */}
        <div style={{ padding: '1.5rem', background: tier === 'pro' ? 'rgba(37,99,235,0.1)' : 'var(--bg1)', borderRadius: '8px', border: `1px solid ${tier === 'pro' ? 'var(--blue)' : 'var(--border)'}` }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
            Pro Tier 
            {tier === 'pro' && <span style={{ fontSize: '0.75rem', background: 'var(--blue)', padding: '0.2rem 0.5rem', borderRadius: '12px' }}>Active</span>}
          </div>
          <div style={{ fontSize: '1.5rem', margin: '0.5rem 0', fontWeight: 'bold' }}>$29 <span style={{fontSize: '0.9rem', color: 'var(--muted)'}}>/mo</span></div>
          <ul style={{ paddingLeft: '1.5rem', color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            <li>5,000 API Calls / month</li>
            <li>Priority Support</li>
            <li>50 Active Monitors</li>
          </ul>
          {tier === 'pro' ? (
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handlePortal}>Manage Plan</button>
          ) : (
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => handleUpgrade('pro')}>Upgrade to Pro</button>
          )}
        </div>

        {/* Business Plan */}
        <div style={{ padding: '1.5rem', background: tier === 'business' ? 'rgba(37,99,235,0.1)' : 'var(--bg1)', borderRadius: '8px', border: `1px solid ${tier === 'business' ? 'var(--blue)' : 'var(--border)'}` }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Business</div>
          <div style={{ fontSize: '1.5rem', margin: '0.5rem 0', fontWeight: 'bold' }}>$99 <span style={{fontSize: '0.9rem', color: 'var(--muted)'}}>/mo</span></div>
          <ul style={{ paddingLeft: '1.5rem', color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            <li>20,000 API Calls / month</li>
            <li>Priority Support</li>
            <li>200 Active Monitors</li>
          </ul>
          {tier === 'business' ? (
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handlePortal}>Manage Plan</button>
          ) : (
            <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => handleUpgrade('business')}>Upgrade to Business</button>
          )}
        </div>

        {/* Enterprise Plan */}
        <div style={{ padding: '1.5rem', background: tier === 'enterprise' ? 'rgba(37,99,235,0.1)' : 'var(--bg1)', borderRadius: '8px', border: `1px solid ${tier === 'enterprise' ? 'var(--blue)' : 'var(--border)'}` }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Enterprise</div>
          <div style={{ fontSize: '1.5rem', margin: '0.5rem 0', fontWeight: 'bold' }}>$249 <span style={{fontSize: '0.9rem', color: 'var(--muted)'}}>/mo</span></div>
          <ul style={{ paddingLeft: '1.5rem', color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            <li>100,000 API Calls / month</li>
            <li>Dedicated Account Manager</li>
            <li>Unlimited Monitors</li>
          </ul>
          {tier === 'enterprise' ? (
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handlePortal}>Manage Plan</button>
          ) : (
            <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => handleUpgrade('enterprise')}>Contact Sales</button>
          )}
        </div>
      </div>
      
      <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
        <h3>Account Hub</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Logged in as: {userId}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-outline" onClick={handlePortal}>Billing Portal (Invoices)</button>
          <button className="btn btn-outline" style={{ color: 'var(--red)', borderColor: 'rgba(239, 68, 68, 0.5)' }}>Delete Account</button>
        </div>
      </div>
    </div>
  )
}
