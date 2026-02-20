const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

function normalizeAIProvider(value) {
  return String(value || '').trim().toLowerCase() === 'groq' ? 'groq' : 'openai';
}

const PORT = Number(process.env.PORT || 4000);
const AI_PROVIDER = normalizeAIProvider(process.env.AI_PROVIDER || 'openai');
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const CALENDAR_TIMEZONE = process.env.CALENDAR_TIMEZONE || 'America/New_York';
const AI_REFERENCE_TIMEZONE = process.env.AI_REFERENCE_TIMEZONE || 'America/New_York';
// frontend now serves UI; backend only handles APIs

function getAIConfig() {
  if (AI_PROVIDER === 'groq') {
    return {
      provider: 'groq',
      providerName: 'Groq',
      apiKeyEnv: 'GROQ_API_KEY',
      apiKey: process.env.GROQ_API_KEY,
      model: GROQ_MODEL,
      url: 'https://api.groq.com/openai/v1/chat/completions',
    };
  }
  return {
    provider: 'openai',
    providerName: 'OpenAI',
    apiKeyEnv: 'OPENAI_API_KEY',
    apiKey: process.env.OPENAI_API_KEY,
    model: OPENAI_MODEL,
    url: 'https://api.openai.com/v1/chat/completions',
  };
}


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

function parseDuration({ startRaw, endRaw, allDay }) {
  const startDate = startRaw ? new Date(startRaw) : null;
  const endDate = endRaw ? new Date(endRaw) : null;
  if (
    !startDate ||
    !endDate ||
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate <= startDate
  ) {
    return {
      durationMinutes: null,
      durationDays: null,
    };
  }

  if (allDay) {
    const days = Math.max(1, Math.round((endDate - startDate) / 86400000));
    return {
      durationMinutes: days * 24 * 60,
      durationDays: days,
    };
  }

  return {
    durationMinutes: Math.max(1, Math.round((endDate - startDate) / 60000)),
    durationDays: null,
  };
}

function normalizeAttachments(item) {
  const raw = Array.isArray(item?.attachments) ? item.attachments : [];
  return raw
    .filter((entry) => entry && typeof entry === 'object')
    .slice(0, 10)
    .map((entry) => ({
      title: String(entry.title || '').trim(),
      fileUrl: String(entry.fileUrl || '').trim(),
      mimeType: String(entry.mimeType || '').trim(),
      iconLink: String(entry.iconLink || '').trim(),
    }))
    .filter((entry) => entry.title || entry.fileUrl || entry.mimeType);
}

function getWeekWindow(weekOffset = 0) {
  const offset = Number.isFinite(Number(weekOffset)) ? Number(weekOffset) : 0;
  const now = new Date();
  const monday = new Date(now);
  const day = monday.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const days = [];
  const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (let i = 0; i < 7; i += 1) {
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
    end: sunday,
    days,
  };
}

function normalizeEvent(item) {
  const startRaw = item.start?.dateTime || item.start?.date || null;
  const endRaw = item.end?.dateTime || item.end?.date || null;
  const allDay = Boolean(item.start?.date && !item.start?.dateTime);
  const startDateObj = startRaw ? new Date(startRaw) : null;
  const timezone = item.start?.timeZone || item.end?.timeZone || CALENDAR_TIMEZONE;
  const dateKey = allDay
    ? item.start?.date || null
    : startDateObj && !Number.isNaN(startDateObj.getTime())
      ? toCalendarDateKey(startDateObj, timezone)
      : null;

  const { durationMinutes, durationDays } = parseDuration({ startRaw, endRaw, allDay });
  const attachments = normalizeAttachments(item);
  const conferenceLink = item.hangoutLink || item.conferenceData?.entryPoints?.[0]?.uri || '';

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
    timezone,
    durationMinutes,
    durationDays,
    startDateTime: item.start?.dateTime || null,
    endDateTime: item.end?.dateTime || null,
    startDate: item.start?.date || null,
    endDate: item.end?.date || null,
    conferenceLink,
    attachments,
    attachmentCount: attachments.length,
    metadata: {
      timezone,
      durationMinutes,
      durationDays,
      conferenceLink,
      attachmentCount: attachments.length,
      attachments,
    },
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

function normalizeImportance(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'high' || v === 'critical' || v === 'urgent' || v === 'p1') return 'high';
  if (v === 'low' || v === 'minor' || v === 'p3') return 'low';
  return 'medium';
}

function normalizeTopTasksResponse(raw) {
  const out = {
    summary: '',
    topTasks: [],
  };
  if (!raw || typeof raw !== 'object') return out;

  if (typeof raw.summary === 'string') {
    out.summary = raw.summary.trim();
  }

  if (!Array.isArray(raw.topTasks)) {
    return out;
  }

  out.topTasks = raw.topTasks
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      title: String(item.title || '').trim(),
      reason: String(item.reason || '').trim(),
      importance: normalizeImportance(item.importance || item.priority),
      sourceEventId: String(item.sourceEventId || item.eventId || '').trim(),
      targetDate: String(item.targetDate || item.date || '').trim(),
      time: String(item.time || '').trim(),
    }))
    .filter((item) => item.title)
    .slice(0, 3);

  return out;
}

function normalizeTopTaskScope(scope) {
  return String(scope || '').trim().toLowerCase() === 'week' ? 'week' : 'today';
}

function taskIdentity(task, fallbackIndex = 0) {
  const sourceEventId = String(task?.sourceEventId || '').trim();
  if (sourceEventId) return `id:${sourceEventId}`;
  const title = String(task?.title || '').trim().toLowerCase();
  const date = String(task?.targetDate || '').trim();
  const time = String(task?.time || '').trim();
  return `text:${title}|${date}|${time}|${fallbackIndex}`;
}

function mergeTopTasks(primaryTasks, fallbackTasks, maxItems = 3) {
  const merged = [];
  const seen = new Set();

  for (const task of Array.isArray(primaryTasks) ? primaryTasks : []) {
    const id = taskIdentity(task);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(task);
    if (merged.length >= maxItems) return merged;
  }

  for (const task of Array.isArray(fallbackTasks) ? fallbackTasks : []) {
    const id = taskIdentity(task);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(task);
    if (merged.length >= maxItems) return merged;
  }

  return merged;
}

function buildEventDateIndex(events) {
  const index = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const eventId = String(event?.id || '').trim();
    const dateKey = String(event?.dateKey || '').trim();
    if (!eventId || !dateKey || index.has(eventId)) continue;
    index.set(eventId, dateKey);
  }
  return index;
}

function filterTopTasksByScope(tasks, scope, todayDateKey, eventDateIndex) {
  const topTaskScope = normalizeTopTaskScope(scope);
  if (topTaskScope !== 'today') {
    return (Array.isArray(tasks) ? tasks : []).slice(0, 3);
  }

  const todayKey = String(todayDateKey || '').trim();
  const filtered = (Array.isArray(tasks) ? tasks : []).filter((task) => {
    const targetDate = String(task?.targetDate || '').trim();
    if (targetDate) return targetDate === todayKey;
    const sourceEventId = String(task?.sourceEventId || '').trim();
    if (sourceEventId && eventDateIndex instanceof Map && eventDateIndex.has(sourceEventId)) {
      return eventDateIndex.get(sourceEventId) === todayKey;
    }
    return false;
  });
  return filtered.slice(0, 3);
}

function extractCompletionText(responseJson) {
  const choices = Array.isArray(responseJson?.choices) ? responseJson.choices : [];
  const chunks = [];
  for (const choice of choices) {
    const text = choice?.message?.content || '';
    if (typeof text === 'string' && text.trim()) {
      chunks.push(text.trim());
    }
  }
  return chunks.join('\n').trim();
}

async function requestAIJsonCompletion({ aiConfig, systemPrompt, userContent, temperature = 0.2 }) {
  const response = await fetch(aiConfig.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${aiConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: aiConfig.model,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`${aiConfig.providerName} request failed: ${response.status} ${details}`);
  }

  const data = await response.json();
  return extractCompletionText(data);
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

function isSmallTalkMessage(message) {
  const m = String(message || '').trim().toLowerCase();
  if (!m) return false;
  return /^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening|thanks|thank you)[!.?\s]*$/.test(m);
}

function looksLikeTemplateReply(replyText) {
  const t = String(replyText || '').toLowerCase();
  return t.includes('suggested events and proposed changes');
}

function hasModificationIntent(message) {
  const m = String(message || '').trim().toLowerCase();
  if (!m) return false;
  return /(move|resched|change|update|edit|modify|delete|remove|cancel|shift|postpone)/.test(m);
}

function toCalendarDateKey(dateObj, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dateObj);
  const year = parts.find((p) => p.type === 'year')?.value || '0000';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

function getNowContext(timezone) {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(now);
  return {
    nowIso: now.toISOString(),
    todayDateKey: toCalendarDateKey(now, timezone),
    weekday,
  };
}

function shiftDateKey(dateKey, deltaDays) {
  const [yearRaw, monthRaw, dayRaw] = String(dateKey || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) return '';
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

function injectRelativeDateHints(reply, todayDateKey) {
  const text = String(reply || '').trim();
  if (!text) return text;

  let out = text;
  const targets = [
    { word: 'today', date: todayDateKey },
    { word: 'tomorrow', date: shiftDateKey(todayDateKey, 1) },
    { word: 'yesterday', date: shiftDateKey(todayDateKey, -1) },
  ];

  for (const target of targets) {
    if (!target.date) continue;
    const hasWord = new RegExp(`\\b${target.word}\\b`, 'i').test(out);
    if (hasWord && !out.includes(target.date)) {
      out = `${out} (${target.word}: ${target.date})`;
    }
  }
  return out;
}

function normalizeIntentOutput(ai, message) {
  const out = {
    reply: String(ai?.reply || '').trim(),
    suggestedEvents: Array.isArray(ai?.suggestedEvents) ? ai.suggestedEvents : [],
    proposedChanges: Array.isArray(ai?.proposedChanges) ? ai.proposedChanges : [],
  };
  if (out.proposedChanges.length === 0 || out.suggestedEvents.length === 0) {
    return out;
  }

  if (hasModificationIntent(message)) {
    return {
      ...out,
      suggestedEvents: [],
    };
  }

  const proposedUpdateSignature = new Set(
    out.proposedChanges
      .filter((c) => c.action === 'update')
      .map((c) => `${String(c.title || '').toLowerCase()}|${String(c.start || '')}|${String(c.end || '')}`)
  );
  return {
    ...out,
    suggestedEvents: out.suggestedEvents.filter((s) => {
      const sig = `${String(s.title || '').toLowerCase()}|${String(s.start || '')}|${String(s.end || '')}`;
      return !proposedUpdateSignature.has(sig);
    }),
  };
}

const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function isScheduleLookupMessage(message) {
  const m = String(message || '').trim().toLowerCase();
  if (!m || hasModificationIntent(m)) return false;
  const hasDayRef = /\b(today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
    m
  );
  const hasLookupIntent =
    /\b(schedule|events?|calendar|busy|free|show|list)\b/.test(m) || /what(?:'s| is)|do i have/.test(m);
  return hasDayRef && hasLookupIntent;
}

function resolveTargetDateKey({ message, weekDays, nowCtx }) {
  const m = String(message || '').trim().toLowerCase();
  if (!m) return null;

  if (m.includes('today')) {
    return { dateKey: nowCtx.todayDateKey, dayName: nowCtx.weekday };
  }
  if (m.includes('tomorrow')) {
    const dateKey = shiftDateKey(nowCtx.todayDateKey, 1);
    return { dateKey, dayName: 'Tomorrow' };
  }
  if (m.includes('yesterday')) {
    const dateKey = shiftDateKey(nowCtx.todayDateKey, -1);
    return { dateKey, dayName: 'Yesterday' };
  }

  const dayMatch = m.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (!dayMatch) return null;
  const dayKey = dayMatch[1];

  const fromWeek = Array.isArray(weekDays)
    ? weekDays.find((day) => String(day?.name || '').toLowerCase() === dayKey)
    : null;
  if (fromWeek?.dateKey) {
    return { dateKey: fromWeek.dateKey, dayName: fromWeek.name };
  }

  const nowIndex = WEEKDAY_KEYS.indexOf(String(nowCtx.weekday || '').toLowerCase());
  const targetIndex = WEEKDAY_KEYS.indexOf(dayKey);
  if (nowIndex === -1 || targetIndex === -1) return null;

  let delta = targetIndex - nowIndex;
  if (new RegExp(`\\bnext\\s+${dayKey}\\b`).test(m) && delta <= 0) {
    delta += 7;
  }
  if (new RegExp(`\\blast\\s+${dayKey}\\b`).test(m) && delta >= 0) {
    delta -= 7;
  }

  const dateKey = shiftDateKey(nowCtx.todayDateKey, delta);
  const dayName = dayKey.charAt(0).toUpperCase() + dayKey.slice(1);
  return { dateKey, dayName };
}

function formatEventTimeRange(event, timezone) {
  if (event?.allDay) return 'All day';
  const startDate = event?.start ? new Date(event.start) : null;
  const endDate = event?.end ? new Date(event.end) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) return 'Time unknown';

  const opts = {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };
  const startText = new Intl.DateTimeFormat('en-US', opts).format(startDate);
  if (!endDate || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return startText;
  }
  const endText = new Intl.DateTimeFormat('en-US', opts).format(endDate);
  return `${startText} - ${endText}`;
}

function sortEventsByStart(a, b) {
  const aStart = a?.start ? new Date(a.start).getTime() : Number.POSITIVE_INFINITY;
  const bStart = b?.start ? new Date(b.start).getTime() : Number.POSITIVE_INFINITY;
  return aStart - bStart;
}

function tryBuildScheduleLookupReply({ message, events, weekDays, timezone, nowCtx }) {
  if (!isScheduleLookupMessage(message)) return null;
  const target = resolveTargetDateKey({ message, weekDays, nowCtx });
  if (!target?.dateKey) return null;

  const dayEvents = (Array.isArray(events) ? events : [])
    .filter((event) => event?.dateKey === target.dateKey)
    .sort(sortEventsByStart);

  if (!dayEvents.length) {
    return `You have no events scheduled for ${target.dayName}, ${target.dateKey}.`;
  }

  const lines = dayEvents.slice(0, 8).map((event) => {
    const timeText = formatEventTimeRange(event, timezone);
    const locationText = event?.location ? ` . ${event.location}` : '';
    return `- ${event.summary} (${timeText}${locationText})`;
  });
  if (dayEvents.length > 8) {
    lines.push(`- +${dayEvents.length - 8} more`);
  }

  const noun = dayEvents.length === 1 ? 'event' : 'events';
  return `You have ${dayEvents.length} ${noun} scheduled for ${target.dayName}, ${target.dateKey}:\n${lines.join('\n')}`;
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
    timeZone: CALENDAR_TIMEZONE,
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
  const nowCtx = getNowContext(AI_REFERENCE_TIMEZONE);
  const aiConfig = getAIConfig();
  const deterministicScheduleReply = tryBuildScheduleLookupReply({
    message,
    events,
    weekDays: week?.days,
    timezone: AI_REFERENCE_TIMEZONE,
    nowCtx,
  });
  if (deterministicScheduleReply) {
    return {
      reply: deterministicScheduleReply,
      suggestedEvents: [],
      proposedChanges: [],
    };
  }

  if (!aiConfig.apiKey) {
    return {
      reply: `${aiConfig.apiKeyEnv} is not configured. Set it in backend/.env to enable AI recommendations.`,
      suggestedEvents: [],
      proposedChanges: [],
    };
  }

  const systemPrompt = [
    'You are AlignAI, a calendar scheduling assistant.',
    'Always answer the latest user message directly.',
    'If the user message is greeting/chit-chat (for example: hello, hi, thanks), respond briefly and conversationally with no schedule changes.',
    'Only suggest new events or edits if the user explicitly asks for planning, adding, moving, deleting, optimizing, or prioritizing.',
    'Never output generic report headers or template text.',
    'Respect existing commitments and avoid overlaps when suggesting changes.',
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
    'If no schedule change is requested, return empty arrays for suggestedEvents and proposedChanges.',
    `Use ${nowCtx.todayDateKey} as "today" in timezone ${AI_REFERENCE_TIMEZONE}.`,
    'Interpret relative dates strictly from that timezone: tomorrow=today+1 day, yesterday=today-1 day.',
    'When your reply text includes relative dates like today/tomorrow/yesterday, also include the explicit YYYY-MM-DD date.',
  ].join('\n');

  const text = await requestAIJsonCompletion({
    aiConfig,
    systemPrompt,
    userContent: [
      `USER_MESSAGE: ${message}`,
      `WEEK_START: ${week.start}`,
      `WEEK_END: ${week.end}`,
      `TODAY_LOCAL_DATE: ${nowCtx.todayDateKey}`,
      `CURRENT_WEEKDAY: ${nowCtx.weekday}`,
      `NOW_UTC: ${nowCtx.nowIso}`,
      `REFERENCE_TIMEZONE: ${AI_REFERENCE_TIMEZONE}`,
      'EXISTING_EVENTS_JSON:',
      JSON.stringify(events),
    ].join('\n'),
    temperature: 0.2,
  });
  const parsed = parseJsonSafely(text);
  if (parsed) {
    const normalized = normalizeIntentOutput(normalizeAIResponse(parsed), message);
    normalized.reply = injectRelativeDateHints(normalized.reply, nowCtx.todayDateKey);
    if (isSmallTalkMessage(message)) {
      return {
        reply: 'Hi! I can help with your calendar. Ask me to add, move, or optimize tasks for this week.',
        suggestedEvents: [],
        proposedChanges: [],
      };
    }
    if (
      looksLikeTemplateReply(normalized.reply) &&
      normalized.suggestedEvents.length === 0 &&
      normalized.proposedChanges.length === 0
    ) {
      return {
        reply: 'Tell me exactly what you want to plan, and I will suggest concrete updates for this week.',
        suggestedEvents: [],
        proposedChanges: [],
      };
    }
    return normalized;
  }

  if (isSmallTalkMessage(message)) {
    return {
      reply: 'Hi! I can help with your calendar. Ask me to add, move, or optimize tasks for this week.',
      suggestedEvents: [],
      proposedChanges: [],
    };
  }

  return {
    reply: injectRelativeDateHints(text || 'AI returned an empty response.', nowCtx.todayDateKey),
    suggestedEvents: [],
    proposedChanges: [],
  };
}

function buildFallbackTopTasks({ events, nowCtx, timezone, scope, weekStart, weekEnd }) {
  const topTaskScope = normalizeTopTaskScope(scope);
  const sortedEvents = (Array.isArray(events) ? events : []).slice().sort(sortEventsByStart);
  const todayEvents = sortedEvents.filter((event) => event?.dateKey === nowCtx.todayDateKey);
  const focusEvents =
    topTaskScope === 'today' ? todayEvents.slice(0, 3) : sortedEvents.slice(0, 3);

  const topTasks = focusEvents.map((event, idx) => {
    const isToday = event?.dateKey === nowCtx.todayDateKey;
    const locationText = event?.location ? ` at ${event.location}` : '';
    const dateText = event?.dateKey || nowCtx.todayDateKey;
    const reason = isToday
      ? `Scheduled for today${locationText}.`
      : `Upcoming on ${dateText}${locationText}.`;

    return {
      title: event?.summary || `Task ${idx + 1}`,
      reason,
      importance: idx === 0 ? 'high' : 'medium',
      sourceEventId: event?.id || '',
      targetDate: dateText,
      time: formatEventTimeRange(event, timezone),
    };
  });

  let summary = '';
  if (topTaskScope === 'week') {
    summary = `Top priorities for this week (${weekStart} to ${weekEnd}) based on your calendar.`;
  } else if (todayEvents.length > 0) {
    summary = `Top priorities for today (${nowCtx.todayDateKey}) based on your calendar.`;
  } else {
    summary = `No events scheduled for today (${nowCtx.todayDateKey}).`;
  }

  return {
    summary,
    topTasks,
  };
}

async function callAITopTasks({ events, week, scope }) {
  const nowCtx = getNowContext(AI_REFERENCE_TIMEZONE);
  const aiConfig = getAIConfig();
  const topTaskScope = normalizeTopTaskScope(scope);
  const weekEvents = (Array.isArray(events) ? events : []).filter((event) => event?.status !== 'cancelled');
  const eventDateIndex = buildEventDateIndex(weekEvents);
  const weekStart = String(week?.start || '').slice(0, 10);
  const weekEnd = String(week?.end || '').slice(0, 10);

  if (weekEvents.length === 0) {
    return {
      summary: `No events scheduled for this week (${weekStart} to ${weekEnd}).`,
      topTasks: [],
      emptyWeek: true,
      scope: topTaskScope,
      todayDateKey: nowCtx.todayDateKey,
      timezone: AI_REFERENCE_TIMEZONE,
    };
  }

  const fallback = buildFallbackTopTasks({
    events: weekEvents,
    nowCtx,
    timezone: AI_REFERENCE_TIMEZONE,
    scope: topTaskScope,
    weekStart,
    weekEnd,
  });

  if (!aiConfig.apiKey) {
    return {
      ...fallback,
      emptyWeek: false,
      scope: topTaskScope,
      todayDateKey: nowCtx.todayDateKey,
      timezone: AI_REFERENCE_TIMEZONE,
    };
  }

  const scopeLabel = topTaskScope === 'week' ? 'this week' : 'today';
  const scopeInstruction =
    topTaskScope === 'week'
      ? `Focus on the full week window (${weekStart} to ${weekEnd}) and choose the three most important commitments.`
      : `Only use events scheduled on ${nowCtx.todayDateKey} (today). If there are no events today, return an empty topTasks array.`;

  const systemPrompt = [
    `You are AlignAI, a scheduling assistant that identifies the top 3 most important tasks for ${scopeLabel}.`,
    'Rank tasks using urgency, deadlines, time pressure, and impact from this week calendar.',
    `Use ${nowCtx.todayDateKey} as "today" in timezone ${AI_REFERENCE_TIMEZONE}.`,
    scopeInstruction,
    'Return JSON only using this schema:',
    '{',
    '  "summary": "string",',
    '  "topTasks": [',
    '    {"title":"string","reason":"string","importance":"high|medium|low","sourceEventId":"string","targetDate":"YYYY-MM-DD","time":"string"}',
    '  ]',
    '}',
    `If this week has 3 or more events, return exactly 3 tasks for ${scopeLabel}.`,
    'If this week has fewer than 3 events, return all available tasks.',
    'Keep each reason under 120 characters.',
  ].join('\n');

  try {
    const text = await requestAIJsonCompletion({
      aiConfig,
      systemPrompt,
      userContent: [
        `TOP_TASK_SCOPE: ${topTaskScope}`,
        `TODAY_LOCAL_DATE: ${nowCtx.todayDateKey}`,
        `CURRENT_WEEKDAY: ${nowCtx.weekday}`,
        `REFERENCE_TIMEZONE: ${AI_REFERENCE_TIMEZONE}`,
        `WEEK_START: ${week?.start || ''}`,
        `WEEK_END: ${week?.end || ''}`,
        'WEEK_EVENTS_JSON:',
        JSON.stringify(weekEvents),
      ].join('\n'),
      temperature: 0.2,
    });
    const parsed = parseJsonSafely(text);
    const normalized = normalizeTopTasksResponse(parsed);
    const scopedTopTasks = filterTopTasksByScope(
      normalized.topTasks,
      topTaskScope,
      nowCtx.todayDateKey,
      eventDateIndex
    );

    if (scopedTopTasks.length === 0) {
      return {
        ...fallback,
        emptyWeek: false,
        scope: topTaskScope,
        todayDateKey: nowCtx.todayDateKey,
        timezone: AI_REFERENCE_TIMEZONE,
      };
    }

    const mergedTopTasks = mergeTopTasks(scopedTopTasks, fallback.topTasks, 3);

    return {
      summary: normalized.summary || fallback.summary,
      topTasks: mergedTopTasks,
      emptyWeek: false,
      scope: topTaskScope,
      todayDateKey: nowCtx.todayDateKey,
      timezone: AI_REFERENCE_TIMEZONE,
    };
  } catch (_err) {
    return {
      ...fallback,
      emptyWeek: false,
      scope: topTaskScope,
      todayDateKey: nowCtx.todayDateKey,
      timezone: AI_REFERENCE_TIMEZONE,
    };
  }
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
  const aiConfig = getAIConfig();
  res.json({
    ok: true,
    aiProvider: aiConfig.provider,
    configuredAiProvider: AI_PROVIDER,
    model: aiConfig.model,
    timezone: CALENDAR_TIMEZONE,
    aiReferenceTimezone: AI_REFERENCE_TIMEZONE,
    hasGoogleConfig: Boolean(
      googleConfig.clientId && googleConfig.clientSecret && googleConfig.redirectUri
    ),
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    hasGroqKey: Boolean(process.env.GROQ_API_KEY),
    hasActiveProviderKey: Boolean(aiConfig.apiKey),
  });
});

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'alignai-backend',
    health: '/api/health',
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

// legacy callback path – some Google OAuth clients may still be configured
// with `/oauth2callback` from earlier versions of this project.  Forward
// requests transparently so the SPA can keep working without reconfiguring
// the client.
app.get('/oauth2callback', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(`/auth/callback${qs}`);
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
    // after login send user to front‑end app
    const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontend}/home`);

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

app.get('/api/ai/top-tasks', requireGoogleConfig, requireAuth, async (req, res) => {
  try {
    const weekOffset = Number(req.query.weekOffset || 0);
    const scope = normalizeTopTaskScope(req.query.scope || 'today');
    const week = getWeekWindow(weekOffset);
    const events = await listEventsForRange(req.authSession, week.start, week.end);
    const ai = await callAITopTasks({
      events,
      week: {
        start: week.start.toISOString(),
        end: week.end.toISOString(),
        days: week.days,
      },
      scope,
    });

    return res.json({
      ok: true,
      weekOffset,
      scope: ai.scope || scope,
      eventsCount: events.length,
      ...ai,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Top tasks generation failed',
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
    console.error('[AI planning failed]', err);
    return res.status(500).json({
      error: 'AI planning failed',
      details: err.message,
    });
  }
});



app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
