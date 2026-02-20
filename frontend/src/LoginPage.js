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
    // redirect directly to backend host so dev-server doesn't intercept
    const backend = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
    window.location.href = `${backend}/auth/login`;
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