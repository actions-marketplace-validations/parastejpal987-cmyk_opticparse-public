import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';

export default function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [authMode, setAuthMode] = useState('login') // 'login' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const captchaRef = useRef(null)
  const [captchaToken, setCaptchaToken] = useState(null)

  useEffect(() => {
    const handlePasswordReset = async () => {
        const hashParams = new URLSearchParams(
            window.location.hash.substring(1)
        );
        const accessToken = hashParams.get('access_token');
        const type = hashParams.get('type');
        
        if (type === 'recovery' && accessToken) {
            const newPassword = prompt(
                'Enter your new password (min 8 characters):'
            );
            if (!newPassword || newPassword.length < 8) {
                alert('Password must be at least 8 characters');
                return;
            }
            
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });
            
            if (error) {
                alert('Error resetting password: ' + error.message);
            } else {
                alert('Password updated successfully! Please log in.');
                window.location.hash = '';
            }
        }
    };
    
    handlePasswordReset();
  }, []);

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    if (!captchaToken) {
      setError('Please complete the captcha verification.');
      return;
    }
    
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(
            email,
            {
                redirectTo: 'https://dashboard.opticparse.com/reset-password',
                captchaToken: captchaToken
            }
        );
        if (error) throw error;
        setSuccess('Password reset email sent! Check your inbox.');
        captchaRef.current?.resetCaptcha();
    } catch (err) {
        setError('Error: ' + err.message);
    }
  };

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: 'https://dashboard.opticparse.com'
        }
    });
    if (error) alert('Google sign in error: ' + error.message);
  };

  const handleGitHubSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
            redirectTo: 'https://dashboard.opticparse.com'
        }
    });
    if (error) alert('GitHub sign in error: ' + error.message);
  };

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      if (authMode === 'login') {
        await signIn(email, password)
      } else if (authMode === 'signup') {
        if (!captchaToken) {
          setError('Please complete the captcha verification.');
          return;
        }
        
        const { data, error: err } = await supabase.auth.signUp({
            email,
            password,
            options: {
                captchaToken: captchaToken
            }
        });
        if (err) throw err;
        setSuccess('Account created! Check your email to confirm.')
        captchaRef.current?.resetCaptcha();
      }
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card animate-in">
        <a href="https://opticparse.com" style={{ display: 'inline-block', marginBottom: '1rem', color: 'var(--muted)', fontSize: '0.85rem', textDecoration: 'none' }}>
          ← Back to Website
        </a>
        <h1 style={{ fontSize: '1.8rem' }}>OpticParse & PhishVision</h1>
        <p>{authMode === 'forgot' ? 'Reset your password' : (authMode === 'login' ? 'Sign in to your developer dashboard' : 'Create your developer account')}</p>
        
        {authMode !== 'forgot' && (
        <>
        <button
            onClick={handleGoogleSignIn}
            style={{
                width: '100%',
                padding: '10px',
                marginTop: '12px',
                background: 'white',
                color: '#333',
                border: '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '0.9rem',
                fontWeight: '500'
            }}
        >
            <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
        </button>

        <button
            onClick={handleGitHubSignIn}
            style={{
                width: '100%',
                padding: '10px',
                marginTop: '8px',
                background: '#24292e',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '0.9rem',
                fontWeight: '500'
            }}
        >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            Continue with GitHub
        </button>
        </>
        )}

        {authMode !== 'forgot' && (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            margin: '16px 0',
            gap: '12px'
        }}>
            <div style={{flex: 1, height: '1px', background: '#333'}}></div>
            <span style={{color: '#666', fontSize: '0.8rem'}}>or continue with email</span>
            <div style={{flex: 1, height: '1px', background: '#333'}}></div>
        </div>
        )}

        {error && <div className="auth-error">{error}</div>}
        {success && <div style={{ background: 'var(--green-dim)', color: 'var(--green)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', marginBottom: '1rem' }}>{success}</div>}
        
        <form onSubmit={authMode === 'forgot' ? handleForgotPasswordSubmit : handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
          </div>
          
          {authMode !== 'forgot' && (
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              {authMode === 'login' && (
                <button 
                    type="button"
                    onClick={() => setAuthMode('forgot')}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#6366f1',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        marginTop: '8px'
                    }}
                >
                    Forgot Password?
                </button>
              )}
            </div>
          )}
          
          {authMode !== 'login' && (
            <div style={{ marginBottom: '1rem' }}>
              <HCaptcha
                  sitekey="5c503b10-3a50-467e-b9fc-d342c56219e2"
                  onVerify={(token) => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken(null)}
                  ref={captchaRef}
                  theme="dark"
              />
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
            {authMode === 'login' ? 'Sign In' : (authMode === 'signup' ? 'Create Account' : 'Send Reset Link')}
          </button>
        </form>
        <div className="auth-switch">
          {authMode === 'login' ? "Don't have an account? " : (authMode === 'signup' ? 'Already have an account? ' : '')}
          {authMode === 'login' && <a onClick={() => { setAuthMode('signup'); setError(''); setSuccess('') }}>Sign up</a>}
          {authMode === 'signup' && <a onClick={() => { setAuthMode('login'); setError(''); setSuccess('') }}>Sign in</a>}
          {authMode === 'forgot' && <a onClick={() => { setAuthMode('login'); setError(''); setSuccess('') }}>Back to Login</a>}
        </div>
      </div>
    </div>
  )
}
