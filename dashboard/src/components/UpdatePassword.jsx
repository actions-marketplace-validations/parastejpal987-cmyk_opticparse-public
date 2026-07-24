import React, { useState } from 'react';
import { supabase } from '../context';

export default function UpdatePassword({ onComplete }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.updateUser({ password });
    
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      alert('Password updated successfully!');
      onComplete();
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2 className="auth-title">Update Password</h2>
        <p className="text-muted" style={{ marginBottom: '1rem', textAlign: 'center' }}>
          Please enter your new password below.
        </p>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleUpdate}>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          
          <button 
            type="submit" 
            className="submit-btn" 
            disabled={loading}
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
