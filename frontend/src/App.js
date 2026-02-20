import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('http://localhost:4000/events')
      .then(res => {
        setEvents(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleLogin = () => {
    window.location.href = 'http://localhost:4000/login';
  };

  return (
    <div className="background">
      <div className="glass-card">
        {!events.length && !loading ? (
          <div className="login-screen">
            <img
              src="https://cdn.jsdelivr.net/gh/umich-lib/logo@main/umishield/umishield.hex-blue.svg"
              alt="Michigan Logo"
              className="um-logo"
            />
            <h1 className="app-title">UM AI Hackathon Calendar</h1>
            <p className="subtitle">Connect your Google Calendar and let AI help organize your week!</p>
            {/* optional fields left for future; currently just Google sign‑in */}
            <button className="login-btn" onClick={handleLogin}>
              <span className="google-icon"></span>
              Sign in with Google
            </button>
          </div>
        ) : loading ? (
          <div className="loader"></div>
        ) : (
          <div className="events-container">
            <h2 style={{ marginTop: '32px' }}>Your Events This Week</h2>
            <ul className="events-list">
              {events.map(event => (
                <li key={event.id}>
                  <strong>{event.summary || "No Title"}</strong><br />
                  <span className="event-date">
                    {event.start.dateTime ?
                      new Date(event.start.dateTime).toLocaleString() :
                      event.start.date
                    }
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <footer className="footer">
        <span>Made at University of Michigan AI Hackathon &nbsp; | &nbsp; Go Blue!</span>
      </footer>
    </div>
  );
}

export default App;