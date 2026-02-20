const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
app.use(cors());

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Step 1: Redirect user for authentication
app.get('/login', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.profile'
    ]
  });
  res.redirect(url);
});

// Step 2: Handle OAuth2 callback and get tokens
let tokenStore = {}; // simple in-memory store for hackathon

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  tokenStore['main'] = tokens; // store for hackathon
  res.redirect('/events');
});

// Step 3: Get calendar events for this week
app.get('/events', async (req, res) => {
  if (!tokenStore['main']) {
    return res.redirect('/login');
  }
  oauth2Client.setCredentials(tokenStore['main']);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Get start/end of this week
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(23,59,59,999);

  const resp = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfWeek.toISOString(),
    timeMax: endOfWeek.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  res.json(resp.data.items);
});

app.listen(4000, () => {
  console.log('Backend running on http://localhost:4000');
});
