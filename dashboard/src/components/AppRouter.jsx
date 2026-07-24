import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { initLocalEngine, routeInference } from '../utils/inferenceRouter';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';
import AuthPage from './AuthPage';
import Dashboard from './Dashboard';
import UpdatePassword from './UpdatePassword';

export default function AppRouter() {
  const { user } = useAuth();
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    // Check if URL has access token and type=recovery
    if (window.location.hash.includes('type=recovery')) {
      setIsRecovery(true);
    }
    
    // Also listen to auth state changes for the recovery event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isRecovery) {
    return <UpdatePassword onComplete={() => {
      setIsRecovery(false);
      window.location.hash = ''; // Clear hash
    }} />;
  }

  return user ? <Dashboard /> : <AuthPage />
}
