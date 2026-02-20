import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const HOUR_HEIGHT = 52;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const EVENT_PALETTES = [
  { bg: 'rgba(99,157,238,0.2)', border: '#4e8fe8', text: '#244975' },
  { bg: 'rgba(105,199,180,0.22)', border: '#69c7b4', text: '#1f5b52' },
  { bg: 'rgba(242,196,93,0.24)', border: '#f2c45d', text: '#6b5120' },
  { bg: 'rgba(228,138,152,0.2)', border: '#e48a98', text: '#6f3040' },
  { bg: 'rgba(159,177,241,0.22)', border: '#879cdf', text: '#2f4075' },
];

function eventColor(event) {
  const key = (event.id || event.summary || '')
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return EVENT_PALETTES[key % EVENT_PALETTES.length];
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtDateRange(start, end) {
  return `${fmtTime(start)} - ${fmtTime(end)}`;
}

function getEventPosition(event) {
  if (!event.start || event.allDay) return null;
  const startDate = new Date(event.start);
  const top = (startDate.getHours() + startDate.getMinutes() / 60) * HOUR_HEIGHT;
  const endDate = event.end ? new Date(event.end) : new Date(startDate.getTime() + 3600000);
  const durationHrs = (endDate - startDate) / 3600000;
  const height = Math.max(durationHrs * HOUR_HEIGHT, 22);
  return { top, height };
}

function isTodayKey(dateKey) {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
  return dateKey === key;
}

function formatWeekLabel(days) {
  if (!days || days.length === 0) return '';
  const first = new Date(days[0].iso);
  const last = new Date(days[days.length - 1].iso);
  const opts = { month: 'short', day: 'numeric' };
  return `${first.toLocaleDateString('en-US', opts)} - ${last.toLocaleDateString('en-US', {
    ...opts,
    year: 'numeric',
  })}`;
}

export default function HomePage() {
  const [profile, setProfile] = useState(null);
  const [weekData, setWeekData] = useState(null);
  const [events, setEvents] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const [chatMessages, setChatMessages] = useState([
    {
      role: 'ai',
      text: 'Hi! I can help you optimize your schedule, suggest new events, or answer questions about your week. What would you like to do?',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    axios
      .get('/api/me')
      .then((res) => {
        if (!res.data || !res.data.authenticated) {
          window.location.href = '/';
          return;
        }
        setProfile(res.data.profile);
      })
      .catch(() => {
        window.location.href = '/';
      });
  }, []);

  const fetchWeek = useCallback((offset) => {
    setLoading(true);
    axios
      .get(`/api/week-events?weekOffset=${offset}`)
      .then((res) => {
        if (!res.data) return;
        setWeekData(res.data.week);
        setEvents(res.data.events || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchWeek(weekOffset);
  }, [weekOffset, fetchWeek]);

  const handleChatSend = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;

    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setChatLoading(true);

    try {
      const res = await axios.post('/api/ai/chat', { message: msg, weekOffset });
      const ai = res.data?.ai;
      if (ai) {
        setChatMessages((prev) => [
          ...prev,
          { role: 'ai', text: ai.reply, suggestedEvents: ai.suggestedEvents },
        ]);
      }
    } catch (err) {
      const details =
        err?.response?.data?.details ||
        err?.response?.data?.error ||
        err?.message ||
        'Unknown error';
      setChatMessages((prev) => [
        ...prev,
        { role: 'ai', text: `Sorry, something went wrong. ${details}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

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
      setChatMessages((prev) => [
        ...prev,
        { role: 'ai', text: `OK. "${suggested.title}" has been added to your calendar.` },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Failed to add event. Please try again.' },
      ]);
    }
  };

  const handleLogout = async () => {
    await axios.post('/auth/logout').catch(() => {});
    window.location.href = '/';
  };

  const days = weekData?.days || [];
  const allDayEvents = events.filter((event) => event.allDay);
  const timedEvents = events.filter((event) => !event.allDay);

  const tooltipLeftMax = typeof window !== 'undefined' ? window.innerWidth - 220 : 1200;

  return (
    <div className="planner planner-liquid">
      <nav className="planner-nav">
        <div className="planner-nav-brand">
          <div className="planner-nav-dot" />
          AlignAI Calendar
        </div>

        <div className="planner-nav-right">
          {profile && (
            <>
              {profile.picture ? (
                <img src={profile.picture} alt="" className="planner-avatar" />
              ) : (
                <div className="planner-avatar-placeholder">{profile.name?.[0] || '?'}</div>
              )}
              <span className="planner-profile-name">{profile.name}</span>
            </>
          )}
          <button className="planner-logout-btn" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </nav>

      <div className="planner-main">
        <section className="planner-cal-panel">
          <header className="planner-cal-header">
            <span className="planner-week-label">{formatWeekLabel(days)}</span>
            <div className="planner-week-nav">
              <button
                className="planner-nav-btn"
                onClick={() => setWeekOffset((offset) => offset - 1)}
                title="Previous week"
              >
                ‹
              </button>
              <button className="planner-today-btn" onClick={() => setWeekOffset(0)}>
                TODAY
              </button>
              <button
                className="planner-nav-btn"
                onClick={() => setWeekOffset((offset) => offset + 1)}
                title="Next week"
              >
                ›
              </button>
            </div>
          </header>

          {allDayEvents.length > 0 && (
            <div className="planner-all-day-strip">
              <span className="planner-all-day-label">All day</span>
              {allDayEvents.map((event) => (
                <span key={event.id} className="planner-all-day-chip">
                  {event.summary}
                </span>
              ))}
            </div>
          )}

          {loading ? (
            <div className="planner-loader">
              <div className="planner-spinner" />
              <span>Loading calendar...</span>
            </div>
          ) : (
            <div className="planner-grid-scroll">
              <div className="planner-grid">
                <div className="planner-grid-corner" />

                {days.map((day, dayIndex) => {
                  const isToday = isTodayKey(day.dateKey);
                  return (
                    <div
                      key={day.dateKey}
                      className="planner-day-header"
                      style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
                    >
                      <span className="planner-day-name">{day.name.slice(0, 3)}</span>
                      <span className={`planner-day-num${isToday ? ' planner-day-num-today' : ''}`}>
                        {new Date(day.iso).getDate()}
                      </span>
                    </div>
                  );
                })}

                {HOURS.map((hour) => (
                  <React.Fragment key={hour}>
                    <div className="planner-time-label" style={{ gridColumn: 1, gridRow: hour + 2 }}>
                      {hour === 0 ? '' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`}
                    </div>

                    {days.map((day, dayIndex) => (
                      <div
                        key={`${day.dateKey}-${hour}`}
                        className={`planner-grid-cell${isTodayKey(day.dateKey) ? ' planner-grid-cell-today' : ''}`}
                        style={{ gridColumn: dayIndex + 2, gridRow: hour + 2 }}
                      />
                    ))}
                  </React.Fragment>
                ))}

                {timedEvents.map((event) => {
                  const position = getEventPosition(event);
                  if (!position) return null;

                  const dayIndex = days.findIndex((day) => day.dateKey === event.dateKey);
                  if (dayIndex === -1) return null;

                  const color = eventColor(event);
                  const startHour = new Date(event.start).getHours();
                  const startMinutes = new Date(event.start).getMinutes();

                  return (
                    <div
                      key={event.id}
                      className="planner-event-chip"
                      style={{
                        gridColumn: dayIndex + 2,
                        gridRow: startHour + 2,
                        marginTop: `${(startMinutes / 60) * HOUR_HEIGHT}px`,
                        height: `${position.height}px`,
                        '--event-bg': color.bg,
                        '--event-border': color.border,
                        '--event-text': color.text,
                      }}
                      onMouseEnter={(ev) => {
                        const rect = ev.currentTarget.getBoundingClientRect();
                        setTooltip({ event, x: rect.right + 8, y: rect.top });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <div className="planner-event-chip-title">{event.summary}</div>
                      {position.height > 36 && (
                        <div className="planner-event-chip-time">{fmtDateRange(event.start, event.end)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <aside className="planner-chat-panel">
          <div className="planner-chat-header">
            <div className="planner-chat-title">
              AI Planner
              <span className="planner-ai-badge">AI</span>
            </div>
            <div className="planner-chat-sub">Ask me anything about your week</div>
          </div>

          <div className="planner-chat-messages">
            {chatMessages.map((msg, idx) => (
              <div key={idx}>
                <div className={`planner-bubble ${msg.role === 'user' ? 'planner-bubble-user' : 'planner-bubble-ai'}`}>
                  {msg.text}
                </div>

                {msg.suggestedEvents && msg.suggestedEvents.length > 0 && (
                  <div className="planner-suggestions">
                    {msg.suggestedEvents.map((suggested, suggestedIndex) => (
                      <div key={suggestedIndex} className="planner-suggestion-card">
                        <div className="planner-suggestion-title">* {suggested.title}</div>
                        <div className="planner-suggestion-meta">
                          {fmtTime(suggested.start)} - {fmtTime(suggested.end)}
                          {suggested.location && ` . ${suggested.location}`}
                        </div>
                        {suggested.reason && (
                          <div className="planner-suggestion-reason">{suggested.reason}</div>
                        )}
                        <button
                          className="planner-add-btn"
                          onClick={() => handleAddSuggested(suggested)}
                        >
                          + Add to calendar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {chatLoading && (
              <div className="planner-bubble planner-bubble-ai planner-bubble-loading">
                <div className="planner-spinner" />
                <span className="planner-thinking-text">Thinking...</span>
              </div>
            )}
          </div>

          <div className="planner-chat-input-row">
            <textarea
              className="planner-chat-input"
              rows={2}
              placeholder="e.g. Add a focus block tomorrow morning"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleChatSend();
                }
              }}
            />
            <button className="planner-send-btn" onClick={handleChatSend} disabled={chatLoading}>
              ↑
            </button>
          </div>
        </aside>
      </div>

      {tooltip && (
        <div
          className="planner-tooltip"
          style={{
            left: Math.min(tooltip.x, tooltipLeftMax),
            top: tooltip.y,
          }}
        >
          <div className="planner-tooltip-title">{tooltip.event.summary}</div>
          <div className="planner-tooltip-body">
            {fmtTime(tooltip.event.start)} - {fmtTime(tooltip.event.end)}
            {tooltip.event.location && (
              <>
                <br />
                Location: {tooltip.event.location}
              </>
            )}
            {tooltip.event.description && (
              <>
                <br />
                {tooltip.event.description.slice(0, 80)}
                {tooltip.event.description.length > 80 ? '...' : ''}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
