const state = {
  authenticated: false,
  profile: null,
  weekOffset: 0,
  week: null,
  events: [],
  todos: [],
};

const TODO_STORAGE_KEY = 'alignai.todos.v1';
const aiPayloads = new Map();
let aiPayloadSeq = 0;

const el = {
  authStatus: document.getElementById('auth-status'),
  loginBtn: document.getElementById('login-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  weekRange: document.getElementById('week-range'),
  calendarGrid: document.getElementById('calendar-grid'),
  prevWeek: document.getElementById('prev-week'),
  thisWeek: document.getElementById('this-week'),
  nextWeek: document.getElementById('next-week'),
  todoForm: document.getElementById('todo-form'),
  todoInput: document.getElementById('todo-input'),
  todoList: document.getElementById('todo-list'),
  eventForm: document.getElementById('event-form'),
  eventTitle: document.getElementById('event-title'),
  eventDate: document.getElementById('event-date'),
  eventStart: document.getElementById('event-start'),
  eventEnd: document.getElementById('event-end'),
  eventLocation: document.getElementById('event-location'),
  eventDescription: document.getElementById('event-description'),
  quickPrompts: Array.from(document.querySelectorAll('.quick-btn')),
  chatMessages: document.getElementById('chat-messages'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
  toast: document.getElementById('toast'),
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDateLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatRange(startIso, endIso) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `${fmt.format(new Date(startIso))} - ${fmt.format(new Date(endIso))}`;
}

function formatEventTime(event) {
  if (event.allDay) return 'All day';
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  return `${pad2(start.getHours())}:${pad2(start.getMinutes())} - ${pad2(end.getHours())}:${pad2(
    end.getMinutes()
  )}`;
}

function toLocalDateTimeInput(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function showToast(message) {
  if (!message) return;
  el.toast.textContent = message;
  el.toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    el.toast.classList.remove('show');
  }, 1800);
}

async function api(path, options = {}) {
  const config = { ...options };
  config.headers = {
    ...(options.headers || {}),
  };
  if (options.body && !config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, config);
  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_err) {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const error = new Error((data && (data.error || data.details)) || `Request failed: ${response.status}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data || {};
}

function loadTodos() {
  try {
    const raw = localStorage.getItem(TODO_STORAGE_KEY);
    if (!raw) {
      state.todos = [];
      return;
    }
    const parsed = JSON.parse(raw);
    state.todos = Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    state.todos = [];
  }
}

function saveTodos() {
  localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(state.todos));
}

function renderTodos() {
  el.todoList.innerHTML = '';
  if (!state.todos.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-day';
    empty.textContent = 'No to-dos yet.';
    el.todoList.appendChild(empty);
    return;
  }

  for (const todo of state.todos) {
    const li = document.createElement('li');
    li.className = `todo-item${todo.done ? ' done' : ''}`;
    li.dataset.id = todo.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(todo.done);
    checkbox.dataset.action = 'toggle-todo';

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = todo.text;

    const remove = document.createElement('button');
    remove.className = 'text-btn';
    remove.dataset.action = 'remove-todo';
    remove.textContent = 'Delete';

    li.appendChild(checkbox);
    li.appendChild(text);
    li.appendChild(remove);
    el.todoList.appendChild(li);
  }
}

function renderAuth() {
  if (!state.authenticated) {
    el.authStatus.textContent = 'Not signed in. Connect your Google account.';
    el.loginBtn.style.display = 'inline-block';
    el.logoutBtn.style.display = 'none';
    return;
  }
  const profileLabel = state.profile?.name || state.profile?.email || 'Connected';
  el.authStatus.textContent = `${profileLabel} account connected`;
  el.loginBtn.style.display = 'none';
  el.logoutBtn.style.display = 'inline-block';
}

function renderWeekBoard() {
  el.calendarGrid.innerHTML = '';
  if (!state.authenticated) {
    const notAuth = document.createElement('div');
    notAuth.className = 'day-column';
    notAuth.innerHTML = '<p class="empty-day">Sign in with Google to load your weekly schedule.</p>';
    el.calendarGrid.appendChild(notAuth);
    el.weekRange.textContent = '';
    return;
  }
  if (!state.week) {
    const loading = document.createElement('div');
    loading.className = 'day-column';
    loading.innerHTML = '<p class="empty-day">Loading calendar...</p>';
    el.calendarGrid.appendChild(loading);
    return;
  }

  el.weekRange.textContent = formatRange(state.week.start, state.week.end);

  for (const day of state.week.days) {
    const col = document.createElement('article');
    col.className = 'day-column';
    col.dataset.dateKey = day.dateKey;

    const title = document.createElement('h3');
    title.className = 'day-title';
    title.textContent = day.name;

    const date = document.createElement('p');
    date.className = 'day-date';
    date.textContent = formatDateLabel(day.dateKey);

    const list = document.createElement('div');
    list.className = 'day-events';

    const items = state.events
      .filter((event) => event.dateKey === day.dateKey)
      .sort((a, b) => {
        const ta = new Date(a.start).getTime();
        const tb = new Date(b.start).getTime();
        return ta - tb;
      });

    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-day';
      empty.textContent = 'No events';
      list.appendChild(empty);
    } else {
      for (const event of items) {
        const card = document.createElement('div');
        card.className = 'event-card';
        card.dataset.id = event.id;

        const row = document.createElement('div');
        row.className = 'event-row';

        const time = document.createElement('span');
        time.className = 'event-time';
        time.textContent = formatEventTime(event);

        const actions = document.createElement('div');
        actions.className = 'event-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'chip-btn';
        editBtn.dataset.action = 'edit-event';
        editBtn.textContent = 'Edit';

        const delBtn = document.createElement('button');
        delBtn.className = 'chip-btn danger';
        delBtn.dataset.action = 'delete-event';
        delBtn.textContent = 'Delete';

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        row.appendChild(time);
        row.appendChild(actions);

        const eventTitle = document.createElement('p');
        eventTitle.className = 'event-title';
        eventTitle.textContent = event.summary || '(No title)';

        const meta = document.createElement('p');
        meta.className = 'event-meta';
        meta.textContent = event.location || event.description || '';

        card.appendChild(row);
        card.appendChild(eventTitle);
        if (meta.textContent) {
          card.appendChild(meta);
        }

        list.appendChild(card);
      }
    }

    col.appendChild(title);
    col.appendChild(date);
    col.appendChild(list);
    el.calendarGrid.appendChild(col);
  }
}

function addMessage(role, text, payload) {
  const wrapper = document.createElement('div');
  wrapper.className = `msg ${role}`;

  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  wrapper.appendChild(paragraph);

  if (role === 'ai' && payload) {
    const payloadId = `ai-${aiPayloadSeq++}`;
    aiPayloads.set(payloadId, payload);

    if (Array.isArray(payload.suggestedEvents) && payload.suggestedEvents.length) {
      const block = document.createElement('div');
      block.className = 'ai-block';
      for (let i = 0; i < payload.suggestedEvents.length; i += 1) {
        const item = payload.suggestedEvents[i];
        const card = document.createElement('div');
        card.className = 'ai-item';
        card.innerHTML = `
          <h4>${item.title}</h4>
          <small>${item.start} - ${item.end}</small>
          <small>${item.reason || ''}</small>
          <div class="ai-item-actions">
            <button class="chip-btn" data-action="apply-suggested" data-payload-id="${payloadId}" data-index="${i}">
              Add to Calendar
            </button>
          </div>
        `;
        block.appendChild(card);
      }
      wrapper.appendChild(block);
    }

    if (Array.isArray(payload.proposedChanges) && payload.proposedChanges.length) {
      const block = document.createElement('div');
      block.className = 'ai-block';
      for (let i = 0; i < payload.proposedChanges.length; i += 1) {
        const item = payload.proposedChanges[i];
        const card = document.createElement('div');
        card.className = 'ai-item';
        const label = item.action === 'delete' ? 'Delete Event' : 'Update Event';
        card.innerHTML = `
          <h4>${label} (${item.eventId})</h4>
          <small>${item.reason || ''}</small>
          <div class="ai-item-actions">
            <button class="chip-btn" data-action="apply-change" data-payload-id="${payloadId}" data-index="${i}">
              Apply Change
            </button>
          </div>
        `;
        block.appendChild(card);
      }
      wrapper.appendChild(block);
    }
  }

  el.chatMessages.appendChild(wrapper);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

async function refreshAuth() {
  try {
    const me = await api('/api/me');
    state.authenticated = Boolean(me.authenticated);
    state.profile = me.profile || null;
    renderAuth();
  } catch (err) {
    state.authenticated = false;
    state.profile = null;
    renderAuth();
    addMessage('ai', `Failed to check auth status: ${err.message}`);
  }
}

async function loadWeekEvents() {
  if (!state.authenticated) {
    state.week = null;
    state.events = [];
    renderWeekBoard();
    return;
  }
  try {
    const data = await api(`/api/week-events?weekOffset=${state.weekOffset}`);
    state.week = data.week;
    state.events = Array.isArray(data.events) ? data.events : [];
    renderWeekBoard();
  } catch (err) {
    addMessage('ai', `Failed to load calendar: ${err.message}`);
    showToast('Could not load calendar.');
  }
}

async function createEventFromInput({ summary, start, end, location, description }) {
  const payload = { summary, start, end, location, description };
  await api('/api/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  showToast('Event created.');
  await loadWeekEvents();
}

async function deleteEvent(eventId) {
  await api(`/api/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
  showToast('Event deleted.');
  await loadWeekEvents();
}

async function updateEvent(eventId, payload) {
  await api(`/api/events/${encodeURIComponent(eventId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  showToast('Event updated.');
  await loadWeekEvents();
}

function findEventById(eventId) {
  return state.events.find((event) => event.id === eventId) || null;
}

async function handleEventEdit(eventId) {
  const target = findEventById(eventId);
  if (!target) return;

  const title = window.prompt('Event title', target.summary || '');
  if (title === null) return;

  const startInputDefault = toLocalDateTimeInput(target.start);
  const endInputDefault = toLocalDateTimeInput(target.end);
  const startInput = window.prompt('Start datetime (YYYY-MM-DDTHH:mm)', startInputDefault);
  if (startInput === null) return;
  const endInput = window.prompt('End datetime (YYYY-MM-DDTHH:mm)', endInputDefault);
  if (endInput === null) return;
  const location = window.prompt('Location', target.location || '');
  if (location === null) return;

  const startDate = new Date(startInput);
  const endDate = new Date(endInput);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    showToast('Invalid date/time format.');
    return;
  }

  await updateEvent(eventId, {
    summary: title.trim(),
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    location: location.trim(),
  });
}

async function applyAISuggested(payloadId, index) {
  const payload = aiPayloads.get(payloadId);
  if (!payload || !payload.suggestedEvents || !payload.suggestedEvents[index]) return;
  const event = payload.suggestedEvents[index];
  await createEventFromInput({
    summary: event.title,
    start: event.start,
    end: event.end,
    description: event.description || event.reason || '',
    location: event.location || '',
  });
}

async function applyAIChange(payloadId, index) {
  const payload = aiPayloads.get(payloadId);
  if (!payload || !payload.proposedChanges || !payload.proposedChanges[index]) return;
  const change = payload.proposedChanges[index];
  if (change.action === 'delete') {
    await deleteEvent(change.eventId);
    return;
  }
  if (change.action === 'update') {
    const updatePayload = {};
    if (change.title) updatePayload.summary = change.title;
    if (change.start && change.end) {
      updatePayload.start = change.start;
      updatePayload.end = change.end;
    }
    if (change.description) updatePayload.description = change.description;
    if (change.location) updatePayload.location = change.location;
    await updateEvent(change.eventId, updatePayload);
  }
}

async function sendChat(message) {
  addMessage('user', message);
  el.chatInput.value = '';

  try {
    const response = await api('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        weekOffset: state.weekOffset,
      }),
    });
    const ai = response.ai || {};
    const replyText = ai.reply || 'AI returned an empty message.';
    addMessage('ai', replyText, ai);
  } catch (err) {
    addMessage('ai', `AI request failed: ${err.message}`);
  }
}

function bindEvents() {
  el.loginBtn.addEventListener('click', () => {
    window.location.href = '/auth/login';
  });

  el.logoutBtn.addEventListener('click', async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
      state.authenticated = false;
      state.profile = null;
      state.week = null;
      state.events = [];
      renderAuth();
      renderWeekBoard();
      showToast('Signed out.');
    } catch (err) {
      showToast(`Sign-out failed: ${err.message}`);
    }
  });

  el.prevWeek.addEventListener('click', async () => {
    state.weekOffset -= 1;
    await loadWeekEvents();
  });
  el.nextWeek.addEventListener('click', async () => {
    state.weekOffset += 1;
    await loadWeekEvents();
  });
  el.thisWeek.addEventListener('click', async () => {
    state.weekOffset = 0;
    await loadWeekEvents();
  });

  el.todoForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = el.todoInput.value.trim();
    if (!text) return;
    state.todos.unshift({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      done: false,
    });
    el.todoInput.value = '';
    saveTodos();
    renderTodos();
  });

  el.todoList.addEventListener('click', (event) => {
    const li = event.target.closest('.todo-item');
    if (!li) return;
    const targetId = li.dataset.id;
    const todo = state.todos.find((item) => item.id === targetId);
    if (!todo) return;

    if (event.target.dataset.action === 'remove-todo') {
      state.todos = state.todos.filter((item) => item.id !== targetId);
      saveTodos();
      renderTodos();
    }
  });

  el.todoList.addEventListener('change', (event) => {
    const li = event.target.closest('.todo-item');
    if (!li || event.target.dataset.action !== 'toggle-todo') return;
    const targetId = li.dataset.id;
    const todo = state.todos.find((item) => item.id === targetId);
    if (!todo) return;
    todo.done = Boolean(event.target.checked);
    saveTodos();
    renderTodos();
  });

  el.eventForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.authenticated) {
      showToast('Please sign in with Google first.');
      return;
    }
    const title = el.eventTitle.value.trim();
    const date = el.eventDate.value;
    const startTime = el.eventStart.value;
    const endTime = el.eventEnd.value;
    if (!title || !date || !startTime || !endTime) {
      showToast('Please fill in all required fields.');
      return;
    }

    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      showToast('Please check the time range.');
      return;
    }

    try {
      await createEventFromInput({
        summary: title,
        start: start.toISOString(),
        end: end.toISOString(),
        location: el.eventLocation.value.trim(),
        description: el.eventDescription.value.trim(),
      });
      el.eventForm.reset();
    } catch (err) {
      showToast(`Failed to create event: ${err.message}`);
    }
  });

  el.calendarGrid.addEventListener('click', async (event) => {
    const card = event.target.closest('.event-card');
    if (!card) return;
    const eventId = card.dataset.id;
    const action = event.target.dataset.action;
    if (!action || !eventId) return;

    try {
      if (action === 'delete-event') {
        const ok = window.confirm('Delete this event?');
        if (!ok) return;
        await deleteEvent(eventId);
      }
      if (action === 'edit-event') {
        await handleEventEdit(eventId);
      }
    } catch (err) {
      showToast(`Failed to process event: ${err.message}`);
    }
  });

  el.quickPrompts.forEach((button) => {
    button.addEventListener('click', () => {
      el.chatInput.value = button.dataset.prompt || '';
      el.chatInput.focus();
    });
  });

  el.chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.authenticated) {
      showToast('Please sign in with Google first.');
      return;
    }
    const message = el.chatInput.value.trim();
    if (!message) return;
    await sendChat(message);
  });

  el.chatMessages.addEventListener('click', async (event) => {
    const action = event.target.dataset.action;
    if (!action) return;
    const payloadId = event.target.dataset.payloadId;
    const index = Number(event.target.dataset.index);
    if (!payloadId || Number.isNaN(index)) return;

    try {
      if (action === 'apply-suggested') {
        await applyAISuggested(payloadId, index);
      }
      if (action === 'apply-change') {
        await applyAIChange(payloadId, index);
      }
    } catch (err) {
      showToast(`Failed to apply AI suggestion: ${err.message}`);
    }
  });
}

async function init() {
  bindEvents();
  loadTodos();
  renderTodos();
  renderWeekBoard();
  addMessage(
    'ai',
    'Hi. Tell me your goal and I will optimize your weekly schedule. Example: "Schedule 3 workouts this week."'
  );

  await refreshAuth();
  await loadWeekEvents();
}

init();
