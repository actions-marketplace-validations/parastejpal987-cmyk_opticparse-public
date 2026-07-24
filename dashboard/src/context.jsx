import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

export const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'https://opticparse-python-sg.onrender.com';
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const LEMON_CHECKOUT_URL = import.meta.env.VITE_LEMON_CHECKOUT_URL || 'https://opticsparse.lemonsqueezy.com/checkout/buy/dfa5da1e-1164-48f1-9575-b50abeafbde1';
export const PHISH_API_URL = import.meta.env.VITE_PHISH_API_URL || 'https://opticparse-1opticparse-node-sg.onrender.com';


export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email, password, options = {}) => {
    const { data, error } = await supabase.auth.signUp({ email, password, ...options });
    if (error) throw error;
    return data;
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) return <div className="auth-container"><div className="text-muted">Loading...</div></div>;

  return (
    <AuthContext.Provider value={{ user, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
