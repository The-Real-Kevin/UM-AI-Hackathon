import React, { useEffect, useState } from 'react';
import axios from 'axios';

function App() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:4000/events')
      .then(res => setEvents(res.data))
      .catch(() => setEvents([]));
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>UM AI Hackathon - Calendar Events This Week</h1>
      {!events.length && <p>No events found. Try <a href="http://localhost:4000/login">logging in</a>.</p>}
      <ul>
        {events.map(event => (
          <li key={event.id}>
            <strong>{event.summary}</strong><br/>
            {event.start.dateTime ? 
              new Date(event.start.dateTime).toLocaleString() : 
              event.start.date}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;