import React from 'react';
import { AuthProvider } from './context';
import AppRouter from './components/AppRouter';
import './index.css';

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
