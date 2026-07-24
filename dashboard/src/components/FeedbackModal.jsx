import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';

export default function FeedbackModal({ isOpen, onClose, user }) {
  const [type, setType] = useState('Bug Report');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const { error } = await supabase.from('user_feedback').insert([
        { 
          user_id: user?.id,
          email: user?.email,
          feedback_type: type,
          message: message
        }
      ]);
      
      if (error) throw error;
      
      setStatus('success');
      setTimeout(() => {
        setStatus('idle');
        setMessage('');
        onClose();
      }, 2000);
    } catch (err) {
      console.error(err);
      setStatus('error');
      alert('Failed to send feedback: ' + err.message);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div className="card animate-in" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Send Feedback</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.5rem' }}>×</button>
        </div>
        
        {status === 'success' ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--green)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
            <p>Thank you! Your feedback has been received.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--muted)', fontSize: '0.9rem' }}>Type of Feedback</label>
              <select 
                value={type} 
                onChange={(e) => setType(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', background: '#1a1a24', color: 'white' }}
              >
                <option value="Bug Report">Bug Report</option>
                <option value="Feature Request">Feature Request</option>
                <option value="General">General Comment</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--muted)', fontSize: '0.9rem' }}>Message</label>
              <textarea 
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what's on your mind..."
                style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', background: '#1a1a24', color: 'white', resize: 'vertical' }}
              />
            </div>
            
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={status === 'loading'}
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              {status === 'loading' ? 'Sending...' : 'Submit Feedback'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
