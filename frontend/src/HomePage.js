import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

// ─── Palette & tokens ────────────────────────────────────────────────────────
const COLORS = {
  bg: '#0d0f14',
  surface: '#161922',
  surfaceAlt: '#1e2230',
  border: '#2a2f40',
  accent: '#5b8af5',
  accentSoft: 'rgba(91,138,245,0.15)',
  accentGlow: 'rgba(91,138,245,0.35)',
  green: '#4ecb8d',
  greenSoft: 'rgba(78,203,141,0.12)',
  amber: '#f5a623',
  amberSoft: 'rgba(245,166,35,0.12)',
  red: '#e05c5c',
  text: '#e8ecf5',
  textMuted: '#7a8299',
  textDim: '#4a5068',
};

// ─── Inline styles ────────────────────────────────────────────────────────────
const S = {
  root: {
    minHeight: '100vh',
    background: COLORS.bg,
    color: COLORS.text,
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    display: 'flex',
    flexDirection: 'column',
  },
  // top nav
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    height: 56,
    background: COLORS.surface,
    borderBottom: `1px solid ${COLORS.border}`,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  navBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontWeight: 700,
    fontSize: 17,
    letterSpacing: '-0.3px',
  },
  navDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.green})`,
    boxShadow: `0 0 8px ${COLORS.accentGlow}`,
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    objectFit: 'cover',
    border: `2px solid ${COLORS.border}`,
  },
  avatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: COLORS.accentSoft,
    border: `2px solid ${COLORS.accent}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.accent,
  },
  logoutBtn: {
    background: 'transparent',
    border: `1px solid ${COLORS.border}`,
    color: COLORS.textMuted,
    padding: '5px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    transition: 'all 0.15s',
  },
  // main layout
  main: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 340px',
    gridTemplateRows: '1fr',
    gap: 0,
    height: 'calc(100vh - 56px)',
    overflow: 'hidden',
  },
  // calendar panel
  calPanel: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRight: `1px solid ${COLORS.border}`,
  },
  calHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: `1px solid ${COLORS.border}`,
    background: COLORS.surface,
    flexShrink: 0,
  },
  weekLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: COLORS.text,
    letterSpacing: '0.3px',
  },
  weekNav: {
    display: 'flex',
    gap: 4,
  },
  navBtn: {
    background: COLORS.surfaceAlt,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.textMuted,
    width: 28,
    height: 28,
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  todayBtn: {
    background: COLORS.accentSoft,
    border: `1px solid ${COLORS.accent}`,
    color: COLORS.accent,
    padding: '0 10px',
    height: 28,
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.5px',
    transition: 'all 0.15s',
  },
  // calendar grid
  calGrid: {
    flex: 1,
    overflow: 'auto',
    display: 'grid',
    gridTemplateColumns: '52px repeat(5, 1fr)',
    gridTemplateRows: '36px repeat(24, 52px)',
    position: 'relative',
  },
  // time label column
  timeLabel: {
    gridColumn: 1,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    paddingRight: 10,
    paddingTop: 2,
    fontSize: 10,
    color: COLORS.textDim,
    fontWeight: 500,
    letterSpacing: '0.3px',
    userSelect: 'none',
  },
  // day header
  dayHeader: {
    gridRow: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottom: `1px solid ${COLORS.border}`,
    borderLeft: `1px solid ${COLORS.border}`,
    background: COLORS.surface,
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  dayName: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.8px',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  dayNum: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.1,
    color: COLORS.text,
  },
  dayNumToday: {
    color: COLORS.accent,
  },
  // grid cells
  gridCell: {
    borderLeft: `1px solid ${COLORS.border}`,
    borderBottom: `1px solid rgba(42,47,64,0.4)`,
    position: 'relative',
    transition: 'background 0.1s',
  },
  // events
  eventChip: {
    position: 'absolute',
    left: 3,
    right: 3,
    borderRadius: 5,
    padding: '3px 6px',
    fontSize: 11,
    fontWeight: 600,
    overflow: 'hidden',
    cursor: 'pointer',
    zIndex: 5,
    lineHeight: 1.3,
    transition: 'filter 0.15s',
  },
  eventChipTitle: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  eventChipTime: {
    opacity: 0.75,
    fontSize: 10,
    fontWeight: 400,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // all-day strip
  allDayStrip: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    gap: 6,
    flexWrap: 'wrap',
    borderBottom: `1px solid ${COLORS.border}`,
    background: COLORS.surface,
    minHeight: 30,
    flexShrink: 0,
  },
  allDayChip: {
    background: COLORS.accentSoft,
    border: `1px solid ${COLORS.accent}`,
    color: COLORS.accent,
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  // right panel: AI chat
  chatPanel: {
    display: 'flex',
    flexDirection: 'column',
    background: COLORS.surface,
    overflow: 'hidden',
  },
  chatHeader: {
    padding: '14px 18px',
    borderBottom: `1px solid ${COLORS.border}`,
    flexShrink: 0,
  },
  chatTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: COLORS.text,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  aiBadge: {
    background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.green})`,
    color: '#fff',
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '1px',
    padding: '2px 6px',
    borderRadius: 4,
    textTransform: 'uppercase',
  },
  chatSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 3,
  },
  chatMessages: {
    flex: 1,
    overflowY: 'auto',
    padding: '14px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  bubble: (isUser) => ({
    maxWidth: '88%',
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    background: isUser ? COLORS.accentSoft : COLORS.surfaceAlt,
    border: `1px solid ${isUser ? COLORS.accent : COLORS.border}`,
    borderRadius: isUser ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
    padding: '9px 12px',
    fontSize: 12,
    lineHeight: 1.55,
    color: COLORS.text,
  }),
  suggestionCard: {
    background: COLORS.surfaceAlt,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    marginTop: 8,
  },
  suggestionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.accent,
    marginBottom: 4,
  },
  suggestionMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 6,
    lineHeight: 1.4,
  },
  suggestionReason: {
    fontSize: 11,
    color: COLORS.textDim,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  addBtn: {
    background: COLORS.accentSoft,
    border: `1px solid ${COLORS.accent}`,
    color: COLORS.accent,
    padding: '4px 10px',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 700,
    transition: 'all 0.15s',
  },
  chatInputRow: {
    display: 'flex',
    gap: 8,
    padding: '10px 14px',
    borderTop: `1px solid ${COLORS.border}`,
    flexShrink: 0,
  },
  chatInput: {
    flex: 1,
    background: COLORS.surfaceAlt,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    color: COLORS.text,
    fontSize: 12,
    padding: '8px 12px',
    resize: 'none',
    outline: 'none',
    lineHeight: 1.4,
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  },
  sendBtn: {
    background: `linear-gradient(135deg, ${COLORS.accent}, #4a7ae0)`,
    border: 'none',
    color: '#fff',
    width: 36,
    height: 36,
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'opacity 0.15s',
    alignSelf: 'flex-end',
  },
  // loading
  loader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: COLORS.textMuted,
    fontSize: 13,
    gap: 10,
  },
  spinner: {
    width: 18,
    height: 18,
    border: `2px solid ${COLORS.border}`,
    borderTop: `2px solid ${COLORS.accent}`,
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const HOUR_HEIGHT = 52; // px per hour (matches gridTemplateRows)
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Generate a deterministic color from event id/title
function eventColor(event) {
  const palettes = [
    { bg: 'rgba(91,138,245,0.25)', border: COLORS.accent, text: '#a8c0ff' },
    { bg: 'rgba(78,203,141,0.22)', border: COLORS.green, text: '#7ddfb0' },
    { bg: 'rgba(245,166,35,0.2)', border: COLORS.amber, text: '#f5c77a' },
    { bg: 'rgba(224,92,92,0.2)', border: COLORS.red, text: '#f0a0a0' },
    { bg: 'rgba(160,110,240,0.2)', border: '#a06ef0', text: '#c8a0ff' },
  ];
  const key = (event.id || event.summary || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return palettes[key % palettes.length];
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtDateRange(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

function getEventPosition(event) {
  if (!event.start || event.allDay) return null;
  const d = new Date(event.start);
  const top = (d.getHours() + d.getMinutes() / 60) * HOUR_HEIGHT;
  const endD = event.end ? new Date(event.end) : new Date(d.getTime() + 3600000);
  const durationHrs = (endD - d) / 3600000;
  const height = Math.max(durationHrs * HOUR_HEIGHT, 22);
  return { top, height };
}

function isTodayKey(dateKey) {
  const today = new Date();
  const k = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return dateKey === k;
}

function formatWeekLabel(days) {
  if (!days || days.length === 0) return '';
  const first = new Date(days[0].iso);
  const last = new Date(days[days.length - 1].iso);
  const opts = { month: 'short', day: 'numeric' };
  return `${first.toLocaleDateString('en-US', opts)} – ${last.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [profile, setProfile] = useState(null);
  const [weekData, setWeekData] = useState(null);
  const [events, setEvents] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const [chatMessages, setChatMessages] = useState([
    { role: 'ai', text: 'Hi! I can help you optimize your schedule, suggest new events, or answer questions about your week. What would you like to do?' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const [tooltip, setTooltip] = useState(null); // { event, x, y }

  // ── Fetch profile once
  useEffect(() => {
    axios.get('/api/me')
      .then(res => {
        if (!res.data || !res.data.authenticated) {
          window.location.href = '/';
        } else {
          setProfile(res.data.profile);
        }
      })
      .catch(() => { window.location.href = '/'; });
  }, []);

  // ── Fetch week events whenever weekOffset changes
  const fetchWeek = useCallback((offset) => {
    setLoading(true);
    axios.get(`/api/week-events?weekOffset=${offset}`)
      .then(res => {
        if (res.data) {
          setWeekData(res.data.week);
          setEvents(res.data.events || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchWeek(weekOffset);
  }, [weekOffset, fetchWeek]);

  // ── Chat submit
  const handleChatSend = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setChatLoading(true);
    try {
      const res = await axios.post('/api/ai/chat', { message: msg, weekOffset });
      const ai = res.data?.ai;
      if (ai) {
        setChatMessages(prev => [...prev, { role: 'ai', text: ai.reply, suggestedEvents: ai.suggestedEvents }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Add suggested event
  const handleAddSuggested = async (suggested) => {
    try {
      await axios.post('/api/events', {
        summary: suggested.title,
        start: suggested.start,
        end: suggested.end,
        description: suggested.description,
        location: suggested.location,
      });
      fetchWeek(weekOffset);
      setChatMessages(prev => [...prev, { role: 'ai', text: `✓ "${suggested.title}" has been added to your calendar!` }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'Failed to add event. Please try again.' }]);
    }
  };

  // ── Logout
  const handleLogout = async () => {
    await axios.post('/auth/logout').catch(() => {});
    window.location.href = '/';
  };

  // ── Derived
  const days = weekData?.days || [];
  const allDayEvents = events.filter(e => e.allDay);
  const timedEvents = events.filter(e => !e.allDay);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${COLORS.bg}; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .chat-messages > * { animation: fadeIn 0.2s ease; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
        .nav-btn:hover { background: ${COLORS.accentSoft} !important; color: ${COLORS.accent} !important; border-color: ${COLORS.accent} !important; }
        .logout-btn:hover { color: ${COLORS.text} !important; border-color: ${COLORS.textMuted} !important; }
        .event-chip:hover { filter: brightness(1.2); }
        .send-btn:hover { opacity: 0.85; }
        .add-btn:hover { background: ${COLORS.accent} !important; color: #fff !important; }
        .grid-cell:hover { background: rgba(91,138,245,0.04) !important; }
        .chat-input:focus { border-color: ${COLORS.accent} !important; }
        .today-btn:hover { background: ${COLORS.accent} !important; color: #fff !important; }
      `}</style>

      <div style={S.root}>
        {/* ── Nav ── */}
        <nav style={S.nav}>
          <div style={S.navBrand}>
            <div style={S.navDot} />
            AlignAI Calendar
          </div>
          <div style={S.navRight}>
            {profile && (
              <>
                {profile.picture
                  ? <img src={profile.picture} alt="" style={S.avatar} />
                  : <div style={S.avatarPlaceholder}>{profile.name?.[0] || '?'}</div>}
                <span style={{ fontSize: 12, color: COLORS.textMuted }}>{profile.name}</span>
              </>
            )}
            <button className="logout-btn" style={S.logoutBtn} onClick={handleLogout}>Sign out</button>
          </div>
        </nav>

        {/* ── Main layout ── */}
        <div style={S.main}>
          {/* ── Calendar panel ── */}
          <div style={S.calPanel}>
            {/* Header row */}
            <div style={S.calHeader}>
              <span style={S.weekLabel}>{formatWeekLabel(days)}</span>
              <div style={S.weekNav}>
                <button className="nav-btn" style={S.navBtn} onClick={() => setWeekOffset(o => o - 1)} title="Previous week">‹</button>
                <button className="today-btn" style={S.todayBtn} onClick={() => setWeekOffset(0)}>TODAY</button>
                <button className="nav-btn" style={S.navBtn} onClick={() => setWeekOffset(o => o + 1)} title="Next week">›</button>
              </div>
            </div>

            {/* All-day events strip */}
            {allDayEvents.length > 0 && (
              <div style={S.allDayStrip}>
                <span style={{ fontSize: 10, color: COLORS.textDim, fontWeight: 600, marginRight: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>All day</span>
                {allDayEvents.map(ev => (
                  <span key={ev.id} style={S.allDayChip}>{ev.summary}</span>
                ))}
              </div>
            )}

            {/* Calendar grid */}
            {loading ? (
              <div style={S.loader}>
                <div style={S.spinner} />
                Loading calendar…
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '52px repeat(5, minmax(100px, 1fr))',
                  gridTemplateRows: `36px repeat(24, ${HOUR_HEIGHT}px)`,
                  minWidth: 560,
                }}>
                  {/* Corner */}
                  <div style={{ gridColumn: 1, gridRow: 1, borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface, position: 'sticky', top: 0, zIndex: 11 }} />

                  {/* Day headers */}
                  {days.map((day, di) => {
                    const isToday = isTodayKey(day.dateKey);
                    return (
                      <div key={day.dateKey} style={{ ...S.dayHeader, gridColumn: di + 2, gridRow: 1 }}>
                        <span style={S.dayName}>{day.name.slice(0, 3)}</span>
                        <span style={{ ...S.dayNum, ...(isToday ? S.dayNumToday : {}) }}>
                          {new Date(day.iso).getDate()}
                        </span>
                      </div>
                    );
                  })}

                  {/* Hour rows */}
                  {HOURS.map(hour => (
                    <React.Fragment key={hour}>
                      {/* Time label */}
                      <div style={{ ...S.timeLabel, gridColumn: 1, gridRow: hour + 2 }}>
                        {hour === 0 ? '' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`}
                      </div>
                      {/* Day cells */}
                      {days.map((day, di) => (
                        <div
                          key={day.dateKey}
                          className="grid-cell"
                          style={{
                            ...S.gridCell,
                            gridColumn: di + 2,
                            gridRow: hour + 2,
                            background: isTodayKey(day.dateKey) ? 'rgba(91,138,245,0.03)' : 'transparent',
                          }}
                        />
                      ))}
                    </React.Fragment>
                  ))}

                  {/* Timed events overlay */}
                  {timedEvents.map(ev => {
                    const pos = getEventPosition(ev);
                    if (!pos) return null;
                    const dayIdx = days.findIndex(d => d.dateKey === ev.dateKey);
                    if (dayIdx === -1) return null;
                    const col = dayIdx + 2;
                    const color = eventColor(ev);
                    const startHour = new Date(ev.start).getHours();
                    const gridRowStart = startHour + 2;

                    return (
                      <div
                        key={ev.id}
                        className="event-chip"
                        style={{
                          ...S.eventChip,
                          gridColumn: col,
                          gridRow: gridRowStart,
                          position: 'relative',
                          marginTop: new Date(ev.start).getMinutes() / 60 * HOUR_HEIGHT,
                          height: pos.height,
                          background: color.bg,
                          border: `1px solid ${color.border}`,
                          color: color.text,
                        }}
                        onMouseEnter={e => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setTooltip({ event: ev, x: r.right + 8, y: r.top });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <div style={S.eventChipTitle}>{ev.summary}</div>
                        {pos.height > 36 && (
                          <div style={S.eventChipTime}>{fmtDateRange(ev.start, ev.end)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── AI Chat panel ── */}
          <div style={S.chatPanel}>
            <div style={S.chatHeader}>
              <div style={S.chatTitle}>
                AI Planner
                <span style={S.aiBadge}>AI</span>
              </div>
              <div style={S.chatSub}>Ask me anything about your week</div>
            </div>

            <div className="chat-messages" style={S.chatMessages}>
              {chatMessages.map((msg, i) => (
                <div key={i}>
                  <div style={S.bubble(msg.role === 'user')}>{msg.text}</div>
                  {/* Suggested events */}
                  {msg.suggestedEvents && msg.suggestedEvents.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {msg.suggestedEvents.map((sug, si) => (
                        <div key={si} style={S.suggestionCard}>
                          <div style={S.suggestionTitle}>✦ {sug.title}</div>
                          <div style={S.suggestionMeta}>
                            {fmtTime(sug.start)} – {fmtTime(sug.end)}
                            {sug.location && ` · ${sug.location}`}
                          </div>
                          {sug.reason && <div style={S.suggestionReason}>{sug.reason}</div>}
                          <button className="add-btn" style={S.addBtn} onClick={() => handleAddSuggested(sug)}>
                            + Add to calendar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div style={{ ...S.bubble(false), display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={S.spinner} />
                  <span style={{ color: COLORS.textMuted, fontSize: 12 }}>Thinking…</span>
                </div>
              )}
            </div>

            <div style={S.chatInputRow}>
              <textarea
                className="chat-input"
                style={S.chatInput}
                rows={2}
                placeholder="e.g. 'Add a focus block tomorrow morning'"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
              />
              <button className="send-btn" style={S.sendBtn} onClick={handleChatSend} disabled={chatLoading}>
                ↑
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Event tooltip ── */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: Math.min(tooltip.x, window.innerWidth - 220),
          top: tooltip.y,
          width: 210,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: '10px 12px',
          zIndex: 200,
          pointerEvents: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: COLORS.text }}>{tooltip.event.summary}</div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.5 }}>
            {fmtTime(tooltip.event.start)} – {fmtTime(tooltip.event.end)}
            {tooltip.event.location && <><br />📍 {tooltip.event.location}</>}
            {tooltip.event.description && <><br />{tooltip.event.description.slice(0, 80)}{tooltip.event.description.length > 80 ? '…' : ''}</>}
          </div>
        </div>
      )}
    </>
  );
}