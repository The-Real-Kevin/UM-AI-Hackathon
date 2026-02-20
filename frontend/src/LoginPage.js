import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';

// to allow the login button to point at a potentially configured backend


export default function LoginPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // if already authenticated, jump to home
    axios.get('/api/me')
      .then(res => {
        if (res.data && res.data.authenticated) {
          navigate('/home');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [navigate]);

  const handleLogin = () => {
    // Always use same-origin auth path so Vercel rewrites can route to backend.
    window.location.href = '/auth/login';
  };

  if (checking) {
    return <div className="loader"></div>;
  }

  return (
    <div className="background">
      <div className="glass-card">
        <div className="login-screen">
          {/* simple grey square placeholder for logo */}
          <div className="app-logo-placeholder" aria-label="AlignAI logo"></div>
          <h1 className="app-title">AlignAI Calendar</h1>
          <p className="subtitle">
            Connect your Google Calendar and let AI help organize your week!
          </p>
          <button className="login-btn" onClick={handleLogin}>
            <span className="google-icon"></span>
            Sign in with Google
          </button>
        </div>
      </div>
      <footer className="footer">
        <span>Powered by AlignAI &nbsp; | &nbsp; Go Blue!</span>
      </footer>
    </div>
  );
}
