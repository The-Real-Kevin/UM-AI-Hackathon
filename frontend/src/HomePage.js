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

function fmtShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function fmtDateTimeRange(start, end) {
  const startDate = fmtShortDate(start);
  const endDate = fmtShortDate(end);
  const startTime = fmtTime(start);
  const endTime = fmtTime(end);

  if (!startDate && !endDate) return fmtDateRange(start, end);
  if (startDate && endDate && startDate !== endDate) {
    return `${startDate} ${startTime} - ${endDate} ${endTime}`;
  }
  return `${startDate || endDate} . ${startTime} - ${endTime}`;
}

function fmtDuration(event) {
  if (typeof event?.durationDays === 'number' && event.durationDays > 0) {
    return `${event.durationDays} day${event.durationDays > 1 ? 's' : ''}`;
  }
  const minutes = typeof event?.durationMinutes === 'number' ? event.durationMinutes : null;
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function getEventPosition(event) {
  if (!event.start || event.allDay) return null;
  const startDate = new Date(event.start);
  if (Number.isNaN(startDate.getTime())) return null;

  const rawEnd = event.end ? new Date(event.end) : new Date(startDate.getTime() + 3600000);
  const endDate =
    Number.isNaN(rawEnd.getTime()) || rawEnd <= startDate
      ? new Date(startDate.getTime() + 3600000)
      : rawEnd;

  const startMinutesOfDay = startDate.getHours() * 60 + startDate.getMinutes();
  const remainingMinutesOfDay = Math.max(1, 24 * 60 - startMinutesOfDay);
  const rawDurationMinutes = Math.max(1, Math.round((endDate - startDate) / 60000));
  const clippedDurationMinutes = Math.min(rawDurationMinutes, remainingMinutesOfDay);
  const durationHrs = clippedDurationMinutes / 60;
  const top = (startMinutesOfDay / 60) * HOUR_HEIGHT;
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

function fmtDateKeyLabel(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey || '';
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtImportanceLabel(importance) {
  const lower = String(importance || 'medium').toLowerCase();
  if (lower === 'high') return 'High';
  if (lower === 'low') return 'Low';
  return 'Medium';
}

function isoToDateKey(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HomePage() {
  const [profile, setProfile] = useState(null);
  const [weekData, setWeekData] = useState(null);
  const [events, setEvents] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [topTasks, setTopTasks] = useState([]);
  const [topTaskSummary, setTopTaskSummary] = useState('');
  const [topTasksLoading, setTopTasksLoading] = useState(true);
  const [topTasksError, setTopTasksError] = useState('');
  const [topTasksEmptyWeek, setTopTasksEmptyWeek] = useState(false);
  const [topTasksDateKey, setTopTasksDateKey] = useState('');
  const [topTasksScope, setTopTasksScope] = useState('today');
  const [smartBlocks, setSmartBlocks] = useState([]);
  const [smartBlocksSummary, setSmartBlocksSummary] = useState('');
  const [smartBlocksLoading, setSmartBlocksLoading] = useState(true);
  const [smartBlocksError, setSmartBlocksError] = useState('');
  const [smartBlocksEmptyWeek, setSmartBlocksEmptyWeek] = useState(false);
  const [smartBlockGoalInput, setSmartBlockGoalInput] = useState('');
  const [smartBlockAppliedGoal, setSmartBlockAppliedGoal] = useState('');
  const [applyingSmartBlockKey, setApplyingSmartBlockKey] = useState('');

  const [chatMessages, setChatMessages] = useState([
    {
      role: 'ai',
      text: 'Hi! I can help you optimize your schedule, suggest new events, or answer questions about your week. What would you like to do?',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [applyingChangeKey, setApplyingChangeKey] = useState('');

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

  const fetchTopTasks = useCallback((offset, scope) => {
    setTopTasksLoading(true);
    setTopTasksError('');
    const topScope = scope === 'week' ? 'week' : 'today';
    axios
      .get(`/api/ai/top-tasks?weekOffset=${offset}&scope=${encodeURIComponent(topScope)}`)
      .then((res) => {
        const payload = res.data || {};
        setTopTasks(Array.isArray(payload.topTasks) ? payload.topTasks : []);
        setTopTaskSummary(String(payload.summary || '').trim());
        setTopTasksEmptyWeek(Boolean(payload.emptyWeek));
        setTopTasksDateKey(String(payload.todayDateKey || '').trim());
      })
      .catch((err) => {
        const details =
          err?.response?.data?.details ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to load Top 3 tasks.';
        setTopTasks([]);
        setTopTaskSummary('');
        setTopTasksEmptyWeek(false);
        setTopTasksError(details);
      })
      .finally(() => setTopTasksLoading(false));
  }, []);

  const fetchSmartBlocks = useCallback((offset, scope, goal, rememberGoal) => {
    setSmartBlocksLoading(true);
    setSmartBlocksError('');
    const blockScope = scope === 'week' ? 'week' : 'today';
    const goalText = String(goal || '').trim();
    axios
      .get(
        `/api/ai/smart-blocks?weekOffset=${offset}&scope=${encodeURIComponent(blockScope)}&goal=${encodeURIComponent(
          goalText
        )}`
      )
      .then((res) => {
        const payload = res.data || {};
        setSmartBlocks(Array.isArray(payload.smartBlocks) ? payload.smartBlocks : []);
        setSmartBlocksSummary(String(payload.summary || '').trim());
        setSmartBlocksEmptyWeek(Boolean(payload.emptyWeek));
        if (rememberGoal) {
          setSmartBlockAppliedGoal(goalText);
        } else {
          setSmartBlockAppliedGoal(String(payload.goalHint || '').trim());
        }
      })
      .catch((err) => {
        const details =
          err?.response?.data?.details ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to load smart block suggestions.';
        setSmartBlocks([]);
        setSmartBlocksSummary('');
        setSmartBlocksEmptyWeek(false);
        setSmartBlocksError(details);
      })
      .finally(() => setSmartBlocksLoading(false));
  }, []);

  useEffect(() => {
    fetchWeek(weekOffset);
    fetchTopTasks(weekOffset, topTasksScope);
    fetchSmartBlocks(weekOffset, topTasksScope, '', false);
  }, [weekOffset, topTasksScope, fetchWeek, fetchTopTasks, fetchSmartBlocks]);

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
          {
            role: 'ai',
            text: ai.reply,
            suggestedEvents: ai.suggestedEvents,
            proposedChanges: ai.proposedChanges,
          },
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
      fetchTopTasks(weekOffset, topTasksScope);
      fetchSmartBlocks(weekOffset, topTasksScope, smartBlockAppliedGoal, false);
      const when = fmtDateTimeRange(suggested.start, suggested.end);
      setChatMessages((prev) => [
        ...prev,
        { role: 'ai', text: `OK. "${suggested.title}" has been added to your calendar for ${when}.` },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Failed to add event. Please try again.' },
      ]);
    }
  };

  const handleApplyProposedChange = async (change) => {
    if (!change?.eventId || !change?.action) return;
    const key = `${change.action}:${change.eventId}`;
    if (applyingChangeKey === key) return;

    setApplyingChangeKey(key);
    try {
      if (change.action === 'delete') {
        await axios.delete(`/api/events/${encodeURIComponent(change.eventId)}`);
        fetchWeek(weekOffset);
        fetchTopTasks(weekOffset, topTasksScope);
        fetchSmartBlocks(weekOffset, topTasksScope, smartBlockAppliedGoal, false);
        setChatMessages((prev) => [
          ...prev,
          { role: 'ai', text: `Deleted event ${change.title || `"${change.eventId}"`}.` },
        ]);
        return;
      }

      if (change.action === 'update') {
        const payload = {};
        if (change.title) payload.summary = change.title;
        if (change.description) payload.description = change.description;
        if (change.location) payload.location = change.location;
        if (change.start && change.end) {
          payload.start = change.start;
          payload.end = change.end;
        }

        if (!Object.keys(payload).length) {
          throw new Error('No update payload was provided by AI.');
        }

        await axios.put(`/api/events/${encodeURIComponent(change.eventId)}`, payload);
        fetchWeek(weekOffset);
        fetchTopTasks(weekOffset, topTasksScope);
        fetchSmartBlocks(weekOffset, topTasksScope, smartBlockAppliedGoal, false);
        setChatMessages((prev) => [
          ...prev,
          { role: 'ai', text: `Updated event ${change.title || `"${change.eventId}"`}.` },
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
        { role: 'ai', text: `Failed to apply change. ${details}` },
      ]);
    } finally {
      setApplyingChangeKey('');
    }
  };

  const handleGenerateSmartBlocks = () => {
    fetchSmartBlocks(weekOffset, topTasksScope, smartBlockGoalInput, true);
  };

  const handleClearSmartBlocks = () => {
    setSmartBlocks([]);
    setSmartBlocksSummary('');
    setSmartBlocksError('');
    setSmartBlocksEmptyWeek(false);
  };

  const handleDismissSmartBlock = (index) => {
    setSmartBlocks((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleApplySmartBlock = async (block, index) => {
    const key = `${block?.title || ''}|${block?.start || ''}|${block?.end || ''}`;
    if (!block?.start || !block?.end || !block?.title || applyingSmartBlockKey === key) return;
    setApplyingSmartBlockKey(key);
    try {
      const description = [block?.description, block?.reason].filter(Boolean).join('\n');
      await axios.post('/api/events', {
        summary: block.title,
        start: block.start,
        end: block.end,
        description,
        location: block.location || '',
      });
      setSmartBlocks((prev) => prev.filter((_, idx) => idx !== index));
      fetchWeek(weekOffset);
      fetchTopTasks(weekOffset, topTasksScope);
      fetchSmartBlocks(weekOffset, topTasksScope, smartBlockAppliedGoal, false);
    } catch (err) {
      const details =
        err?.response?.data?.details ||
        err?.response?.data?.error ||
        err?.message ||
        'Unknown error';
      setSmartBlocksError(`Failed to apply smart block. ${details}`);
    } finally {
      setApplyingSmartBlockKey('');
    }
  };

  const handleLogout = async () => {
    await axios.post('/auth/logout').catch(() => {});
    window.location.href = '/';
  };

  const days = weekData?.days || [];
  const allDayEvents = events.filter((event) => event.allDay);
  const timedEvents = events.filter((event) => !event.allDay);
  const dayColumnCount = Math.max(days.length, 1);
  const gridMinWidth = 52 + dayColumnCount * 100;

  const tooltipLeftMax = typeof window !== 'undefined' ? window.innerWidth - 260 : 1200;

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
        <aside className="planner-tasks-panel">
          <div className="planner-tasks-header">
            <div className="planner-tasks-title">
              AI Top 3 Tasks
              <span className="planner-ai-badge">AI</span>
            </div>
            <div className="planner-tasks-sub">
              {topTasksScope === 'week'
                ? days.length > 0
                  ? `Week: ${formatWeekLabel(days)}`
                  : 'This week priorities'
                : topTasksDateKey
                  ? `Today: ${fmtDateKeyLabel(topTasksDateKey)}`
                  : 'Today priorities'}
            </div>
            <div className="planner-tasks-toggle" role="tablist" aria-label="Top tasks scope">
              <button
                className={`planner-tasks-toggle-btn${topTasksScope === 'today' ? ' planner-tasks-toggle-btn-active' : ''}`}
                type="button"
                onClick={() => setTopTasksScope('today')}
              >
                Today
              </button>
              <button
                className={`planner-tasks-toggle-btn${topTasksScope === 'week' ? ' planner-tasks-toggle-btn-active' : ''}`}
                type="button"
                onClick={() => setTopTasksScope('week')}
              >
                This Week
              </button>
            </div>
          </div>

          <div className="planner-tasks-body">
            {topTasksLoading ? (
              <div className="planner-tasks-empty">
                <div className="planner-spinner" />
                <span>Analyzing calendar...</span>
              </div>
            ) : topTasksError ? (
              <div className="planner-tasks-empty">{topTasksError}</div>
            ) : topTasksEmptyWeek ? (
              <div className="planner-tasks-empty">No events scheduled this week.</div>
            ) : topTasks.length === 0 ? (
              <div className="planner-tasks-empty">
                {topTaskSummary || (topTasksScope === 'today' ? 'No events scheduled for today.' : 'No top tasks were generated.')}
              </div>
            ) : (
              <>
                {topTaskSummary && <div className="planner-tasks-summary">{topTaskSummary}</div>}
                <div className="planner-top3-list">
                  {topTasks.map((task, index) => {
                    const importance = String(task?.importance || 'medium').toLowerCase();
                    const importanceLabel = fmtImportanceLabel(importance);
                    const dateText = task?.targetDate ? fmtDateKeyLabel(task.targetDate) : '';
                    const timeText = String(task?.time || '').trim();
                    const metaText = [dateText, timeText].filter(Boolean).join(' . ');
                    return (
                      <div key={`${task?.sourceEventId || task?.title || 'task'}-${index}`} className="planner-top3-card">
                        <div className="planner-top3-head">
                          <span className="planner-top3-rank">#{index + 1}</span>
                          <span className={`planner-top3-importance planner-top3-importance-${importance}`}>
                            {importanceLabel}
                          </span>
                        </div>
                        <div className="planner-top3-title">{task?.title || `Task ${index + 1}`}</div>
                        {metaText && <div className="planner-top3-meta">{metaText}</div>}
                        {task?.reason && <div className="planner-top3-reason">{task.reason}</div>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className="planner-smart-section">
              <div className="planner-smart-section-head">
                <div className="planner-smart-section-title">Smart Block Suggestions</div>
                <div className="planner-smart-section-sub">
                  Dotted blocks are optional AI suggestions. Apply only what you want.
                </div>
              </div>

              <div className="planner-smart-controls">
                <input
                  className="planner-smart-input"
                  type="text"
                  placeholder='Goal hint (optional): "study time for quiz on 20th"'
                  value={smartBlockGoalInput}
                  onChange={(e) => setSmartBlockGoalInput(e.target.value)}
                />
                <div className="planner-smart-actions-row">
                  <button className="planner-smart-btn" type="button" onClick={handleGenerateSmartBlocks}>
                    Regenerate
                  </button>
                  <button
                    className="planner-smart-btn planner-smart-btn-muted"
                    type="button"
                    onClick={handleClearSmartBlocks}
                  >
                    Clear
                  </button>
                </div>
                {smartBlockAppliedGoal && (
                  <div className="planner-smart-goal-chip">Goal: {smartBlockAppliedGoal}</div>
                )}
              </div>

              {smartBlocksLoading ? (
                <div className="planner-smart-empty">
                  <div className="planner-spinner" />
                  <span>Generating smart blocks...</span>
                </div>
              ) : smartBlocksError ? (
                <div className="planner-smart-empty">{smartBlocksError}</div>
              ) : smartBlocksEmptyWeek ? (
                <div className="planner-smart-empty">No events scheduled this week for smart-block analysis.</div>
              ) : smartBlocks.length === 0 ? (
                <div className="planner-smart-empty">{smartBlocksSummary || 'No smart blocks suggested.'}</div>
              ) : (
                <div className="planner-smart-list">
                  {smartBlocksSummary && <div className="planner-smart-summary">{smartBlocksSummary}</div>}
                  {smartBlocks.map((block, blockIndex) => {
                    const key = `${block?.title || 'block'}|${block?.start || ''}|${block?.end || ''}`;
                    const applying = applyingSmartBlockKey === key;
                    return (
                      <div key={`${key}|${blockIndex}`} className="planner-smart-card">
                        <div className="planner-smart-card-title">{block.title}</div>
                        <div className="planner-smart-card-meta">{fmtDateTimeRange(block.start, block.end)}</div>
                        {block.reason && <div className="planner-smart-card-reason">{block.reason}</div>}
                        <div className="planner-smart-card-actions">
                          <button
                            className="planner-add-btn"
                            type="button"
                            disabled={applying}
                            onClick={() => handleApplySmartBlock(block, blockIndex)}
                          >
                            {applying ? 'Applying...' : 'Apply block'}
                          </button>
                          <button
                            className="planner-smart-dismiss-btn"
                            type="button"
                            onClick={() => handleDismissSmartBlock(blockIndex)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

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
              <div
                className="planner-grid"
                style={{
                  gridTemplateColumns: `52px repeat(${dayColumnCount}, minmax(100px, 1fr))`,
                  minWidth: `${gridMinWidth}px`,
                }}
              >
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

                {smartBlocks.map((block, index) => {
                  const position = getEventPosition({
                    start: block?.start,
                    end: block?.end,
                    allDay: false,
                  });
                  if (!position) return null;

                  const dateKey = String(block?.dateKey || isoToDateKey(block?.start));
                  const dayIndex = days.findIndex((day) => day.dateKey === dateKey);
                  if (dayIndex === -1) return null;

                  const startDate = new Date(block.start);
                  if (Number.isNaN(startDate.getTime())) return null;
                  const startHour = startDate.getHours();
                  const startMinutes = startDate.getMinutes();

                  const tooltipEvent = {
                    summary: `Suggested: ${block.title || 'Smart block'}`,
                    start: block.start,
                    end: block.end,
                    description: [block.reason, block.description].filter(Boolean).join(' '),
                    timezone: block.timezone || '',
                    location: block.location || '',
                    attachmentCount: 0,
                    attachments: [],
                    conferenceLink: '',
                    durationMinutes: Math.max(1, Math.round((new Date(block.end) - new Date(block.start)) / 60000)),
                  };

                  return (
                    <div
                      key={`smart-block-${index}-${dateKey}`}
                      className="planner-smart-block-chip"
                      style={{
                        gridColumn: dayIndex + 2,
                        gridRow: startHour + 2,
                        marginTop: `${(startMinutes / 60) * HOUR_HEIGHT}px`,
                        height: `${position.height}px`,
                      }}
                      onMouseEnter={(ev) => {
                        const rect = ev.currentTarget.getBoundingClientRect();
                        setTooltip({ event: tooltipEvent, x: rect.right + 8, y: rect.top });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <div className="planner-event-chip-title">{block.title}</div>
                      {position.height > 36 && (
                        <div className="planner-event-chip-time">{fmtDateRange(block.start, block.end)}</div>
                      )}
                    </div>
                  );
                })}

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
            {chatMessages.map((msg, idx) => {
              const hasProposedChanges = Array.isArray(msg.proposedChanges) && msg.proposedChanges.length > 0;
              return (
                <div key={idx}>
                  <div className={`planner-bubble ${msg.role === 'user' ? 'planner-bubble-user' : 'planner-bubble-ai'}`}>
                    {msg.text}
                  </div>

                  {!hasProposedChanges && msg.suggestedEvents && msg.suggestedEvents.length > 0 && (
                    <div className="planner-suggestions">
                      {msg.suggestedEvents.map((suggested, suggestedIndex) => (
                        <div key={suggestedIndex} className="planner-suggestion-card">
                          <div className="planner-suggestion-title">* {suggested.title}</div>
                          <div className="planner-suggestion-meta">
                            {fmtDateTimeRange(suggested.start, suggested.end)}
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

                  {hasProposedChanges && (
                    <div className="planner-proposed-list">
                      {msg.proposedChanges.map((change, changeIndex) => {
                        const key = `${change.action}:${change.eventId}:${changeIndex}`;
                        const applying = applyingChangeKey === `${change.action}:${change.eventId}`;
                        const isDelete = change.action === 'delete';
                        return (
                          <div key={key} className="planner-proposed-card">
                            <div className="planner-proposed-title">
                              {isDelete ? 'Delete' : 'Update'}: {change.title || change.eventId}
                            </div>
                            <div className="planner-proposed-meta">
                              {change.start && change.end ? fmtDateTimeRange(change.start, change.end) : 'Time unchanged'}
                              {change.location ? ` . ${change.location}` : ''}
                            </div>
                            {change.reason && <div className="planner-proposed-reason">{change.reason}</div>}
                            <button
                              className={`planner-change-btn ${isDelete ? 'planner-change-btn-danger' : ''}`}
                              onClick={() => handleApplyProposedChange(change)}
                              disabled={applying}
                            >
                              {applying ? 'Applying...' : isDelete ? 'Apply delete' : 'Apply update'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

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
            {fmtDateTimeRange(tooltip.event.start, tooltip.event.end)}
            {fmtDuration(tooltip.event) && (
              <>
                <br />
                Duration: {fmtDuration(tooltip.event)}
              </>
            )}
            {tooltip.event.timezone && (
              <>
                <br />
                Timezone: {tooltip.event.timezone}
              </>
            )}
            {tooltip.event.location && (
              <>
                <br />
                Location: {tooltip.event.location}
              </>
            )}
            {tooltip.event.attachmentCount > 0 && (
              <>
                <br />
                Attachments: {tooltip.event.attachmentCount}
                {Array.isArray(tooltip.event.attachments) && tooltip.event.attachments.length > 0 && (
                  <> ({tooltip.event.attachments.slice(0, 2).map((a) => a.title || a.mimeType || 'file').join(', ')})</>
                )}
              </>
            )}
            {tooltip.event.conferenceLink && (
              <>
                <br />
                Meeting link available
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
