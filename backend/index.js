const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 4000);
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const CALENDAR_TIMEZONE = process.env.CALENDAR_TIMEZONE || 'Asia/Seoul';
const STATIC_DIR = path.resolve(__dirname, '..', 'web');

const googleConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
};

const sessions = new Map();

function createOAuthClient(tokens) {
  const client = new google.auth.OAuth2(
    googleConfig.clientId,
    googleConfig.clientSecret,
    googleConfig.redirectUri
  );
  if (tokens) {
    client.setCredentials(tokens);
  }
  return client;
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((acc, pair) => {
    const [rawKey, ...rest] = pair.trim().split('=');
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function setSessionCookie(res, sid) {
  res.setHeader(
    'Set-Cookie',
    `sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function getOrCreateSession(req, res) {
  const sid = parseCookies(req.headers.cookie || '').sid;
  if (sid && sessions.has(sid)) {
    return { sid, session: sessions.get(sid) };
  }
  const newSid = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const newSession = {
    tokens: null,
    oauthState: null,
  };
  sessions.set(newSid, newSession);
  setSessionCookie(res, newSid);
  return { sid: newSid, session: newSession };
}

function getSession(req) {
  const sid = parseCookies(req.headers.cookie || '').sid;
  if (!sid || !sessions.has(sid)) return null;
  return { sid, session: sessions.get(sid) };
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
}

function getWeekWindow(weekOffset = 0) {
  const offset = Number.isFinite(Number(weekOffset)) ? Number(weekOffset) : 0;
  const now = new Date();
  const monday = new Date(now);
  const day = monday.getDay(); // Sun=0, Mon=1...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  const days = [];
  const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  for (let i = 0; i < 5; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      index: i,
      name: weekdayNames[i],
      dateKey: toDateKey(d),
      iso: d.toISOString(),
    });
  }

  return {
    start: monday,
    end: friday,
    days,
  };
}

function normalizeEvent(item) {
  const startRaw = item.start?.dateTime || item.start?.date || null;
  const endRaw = item.end?.dateTime || item.end?.date || null;
  const allDay = Boolean(item.start?.date && !item.start?.dateTime);
  const startDateObj = startRaw ? new Date(startRaw) : null;
  const dateKey = allDay
    ? item.start?.date || null
    : startDateObj && !Number.isNaN(startDateObj.getTime())
      ? toDateKey(startDateObj)
      : null;

  return {
    id: item.id,
    summary: item.summary || '(No title)',
    description: item.description || '',
    location: item.location || '',
    htmlLink: item.htmlLink || '',
    status: item.status || '',
    start: startRaw,
    end: endRaw,
    allDay,
    dateKey,
  };
}

function normalizeAIResponse(raw) {
  const base = {
    reply: '',
    suggestedEvents: [],
    proposedChanges: [],
  };
  if (!raw || typeof raw !== 'object') return base;

  if (typeof raw.reply === 'string') {
    base.reply = raw.reply.trim();
  }

  if (Array.isArray(raw.suggestedEvents)) {
    base.suggestedEvents = raw.suggestedEvents
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        title: String(item.title || '').trim(),
        start: String(item.start || '').trim(),
        end: String(item.end || '').trim(),
        description: String(item.description || '').trim(),
        location: String(item.location || '').trim(),
        reason: String(item.reason || '').trim(),
      }))
      .filter((item) => item.title && item.start && item.end);
  }

  if (Array.isArray(raw.proposedChanges)) {
    base.proposedChanges = raw.proposedChanges
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        action: String(item.action || '').trim().toLowerCase(),
        eventId: String(item.eventId || '').trim(),
        title: String(item.title || '').trim(),
        start: String(item.start || '').trim(),
        end: String(item.end || '').trim(),
        description: String(item.description || '').trim(),
        location: String(item.location || '').trim(),
        reason: String(item.reason || '').trim(),
      }))
      .filter((item) => item.eventId && (item.action === 'update' || item.action === 'delete'));
  }

  return base;
}

function extractOutputText(responseJson) {
  if (typeof responseJson?.output_text === 'string' && responseJson.output_text.trim()) {
    return responseJson.output_text.trim();
  }
  const outputItems = Array.isArray(responseJson?.output) ? responseJson.output : [];
  const chunks = [];
  for (const item of outputItems) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const chunk of content) {
      const text = chunk?.text || chunk?.value || '';
      if (typeof text === 'string' && text.trim()) {
        chunks.push(text.trim());
      }
    }
  }
  return chunks.join('\n').trim();
}

function parseJsonSafely(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_err) {
    // fall through
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(text.slice(first, last + 1));
  } catch (_err) {
    return null;
  }
}

async function listEventsForRange(session, start, end) {
  const auth = createOAuthClient(session.tokens);
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 300,
  });
  return (response.data.items || []).map(normalizeEvent);
}

async function getUserProfile(session) {
  const auth = createOAuthClient(session.tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth });
  const response = await oauth2.userinfo.get();
  return {
    name: response.data.name || '',
    email: response.data.email || '',
    picture: response.data.picture || '',
  };
}

async function callAIPlanner({ message, events, week }) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      reply:
        'OPENAI_API_KEY is not configured. Set it in backend/.env to enable AI recommendations.',
      suggestedEvents: [],
      proposedChanges: [],
    };
  }

  const systemPrompt = [
    'You are an AI scheduling assistant.',
    'Analyze existing events and suggest realistic improvements.',
    'Respect existing commitments and avoid overlaps.',
    'Return JSON only with this schema:',
    '{',
    '  "reply": "string",',
    '  "suggestedEvents": [',
    '    {"title":"string","start":"ISO-8601","end":"ISO-8601","description":"string","location":"string","reason":"string"}',
    '  ],',
    '  "proposedChanges": [',
    '    {"action":"update|delete","eventId":"string","title":"string","start":"ISO-8601","end":"ISO-8601","description":"string","location":"string","reason":"string"}',
    '  ]',
    '}',
    'For proposedChanges action=delete, include eventId and reason only.',
    'Keep suggestedEvents max 4 and proposedChanges max 3.',
  ].join('\n');

  const payload = {
    timezone: CALENDAR_TIMEZONE,
    week,
    userMessage: message,
    events,
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.35,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
        {
          role: 'user',
          content: [{ type: 'input_text', text: JSON.stringify(payload) }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${details}`);
  }

  const data = await response.json();
  const text = extractOutputText(data);
  const parsed = parseJsonSafely(text);
  if (parsed) return normalizeAIResponse(parsed);

  return {
    reply: text || 'AI returned an empty response.',
    suggestedEvents: [],
    proposedChanges: [],
  };
}

function requireGoogleConfig(_req, res, next) {
  if (!googleConfig.clientId || !googleConfig.clientSecret || !googleConfig.redirectUri) {
    return res.status(500).json({
      error: 'Google OAuth env vars are missing.',
      required: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    });
  }
  return next();
}

function requireAuth(req, res, next) {
  const holder = getOrCreateSession(req, res);
  if (!holder.session.tokens) {
    return res.status(401).json({
      error: 'Not authenticated',
      loginUrl: '/auth/login',
    });
  }
  req.authSession = holder.session;
  return next();
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: OPENAI_MODEL,
    timezone: CALENDAR_TIMEZONE,
    hasGoogleConfig: Boolean(
      googleConfig.clientId && googleConfig.clientSecret && googleConfig.redirectUri
    ),
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
  });
});

app.get('/api/me', requireGoogleConfig, async (req, res) => {
  try {
    const holder = getOrCreateSession(req, res);
    if (!holder.session.tokens) {
      return res.json({
        authenticated: false,
        loginUrl: '/auth/login',
      });
    }
    const profile = await getUserProfile(holder.session);
    return res.json({
      authenticated: true,
      profile,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to read profile',
      details: err.message,
    });
  }
});

app.get('/auth/login', requireGoogleConfig, (req, res) => {
  const { session } = getOrCreateSession(req, res);
  session.oauthState = crypto.randomBytes(16).toString('hex');

  const oauth = createOAuthClient();
  const url = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    state: session.oauthState,
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  });
  res.redirect(url);
});

app.get('/auth/callback', requireGoogleConfig, async (req, res) => {
  try {
    const { session } = getOrCreateSession(req, res);
    const code = req.query.code;
    const state = req.query.state;
    if (!code) {
      return res.status(400).json({ error: 'Missing "code" query value.' });
    }
    if (!state || state !== session.oauthState) {
      return res.status(400).json({ error: 'Invalid OAuth state.' });
    }

    const oauth = createOAuthClient();
    const { tokens } = await oauth.getToken(code);
    session.tokens = tokens;
    session.oauthState = null;
    return res.redirect('/');
  } catch (err) {
    return res.status(500).json({
      error: 'OAuth callback failed',
      details: err.message,
    });
  }
});

app.post('/auth/logout', (req, res) => {
  const holder = getSession(req);
  if (holder) {
    sessions.delete(holder.sid);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/week-events', requireGoogleConfig, requireAuth, async (req, res) => {
  try {
    const weekOffset = Number(req.query.weekOffset || 0);
    const week = getWeekWindow(weekOffset);
    const events = await listEventsForRange(req.authSession, week.start, week.end);
    return res.json({
      week: {
        start: week.start.toISOString(),
        end: week.end.toISOString(),
        days: week.days,
        weekOffset,
      },
      events,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to read calendar events',
      details: err.message,
    });
  }
});

app.post('/api/events', requireGoogleConfig, requireAuth, async (req, res) => {
  try {
    const summary = String(req.body?.summary || '').trim();
    const start = String(req.body?.start || '').trim();
    const end = String(req.body?.end || '').trim();
    const description = String(req.body?.description || '').trim();
    const location = String(req.body?.location || '').trim();

    if (!summary || !start || !end) {
      return res.status(400).json({
        error: 'summary, start, end are required',
      });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      return res.status(400).json({
        error: 'Invalid date range',
      });
    }

    const auth = createOAuthClient(req.authSession.tokens);
    const calendar = google.calendar({ version: 'v3', auth });
    const created = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        location,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: CALENDAR_TIMEZONE,
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: CALENDAR_TIMEZONE,
        },
      },
    });

    return res.status(201).json({
      ok: true,
      event: normalizeEvent(created.data),
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to create event',
      details: err.message,
    });
  }
});

app.put('/api/events/:eventId', requireGoogleConfig, requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const summary = req.body?.summary;
    const start = req.body?.start;
    const end = req.body?.end;
    const description = req.body?.description;
    const location = req.body?.location;

    const requestBody = {};
    if (typeof summary === 'string') requestBody.summary = summary;
    if (typeof description === 'string') requestBody.description = description;
    if (typeof location === 'string') requestBody.location = location;

    if (start || end) {
      if (!start || !end) {
        return res.status(400).json({
          error: 'Both start and end are required together',
        });
      }
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
        return res.status(400).json({ error: 'Invalid date range' });
      }
      requestBody.start = { dateTime: startDate.toISOString(), timeZone: CALENDAR_TIMEZONE };
      requestBody.end = { dateTime: endDate.toISOString(), timeZone: CALENDAR_TIMEZONE };
    }

    if (!Object.keys(requestBody).length) {
      return res.status(400).json({
        error: 'No update payload provided',
      });
    }

    const auth = createOAuthClient(req.authSession.tokens);
    const calendar = google.calendar({ version: 'v3', auth });
    const updated = await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody,
    });

    return res.json({
      ok: true,
      event: normalizeEvent(updated.data),
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to update event',
      details: err.message,
    });
  }
});

app.delete('/api/events/:eventId', requireGoogleConfig, requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const auth = createOAuthClient(req.authSession.tokens);
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to delete event',
      details: err.message,
    });
  }
});

app.post('/api/ai/chat', requireGoogleConfig, requireAuth, async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    const weekOffset = Number(req.body?.weekOffset || 0);
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const week = getWeekWindow(weekOffset);
    const events = await listEventsForRange(req.authSession, week.start, week.end);
    const ai = await callAIPlanner({
      message,
      events,
      week: {
        start: week.start.toISOString(),
        end: week.end.toISOString(),
        days: week.days,
      },
    });

    return res.json({
      ok: true,
      weekOffset,
      ai,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'AI planning failed',
      details: err.message,
    });
  }
});

app.use(express.static(STATIC_DIR));

app.get('*', (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
