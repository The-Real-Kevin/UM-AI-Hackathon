# AlignAI

This is a web app that connects to your Google Calendar and provides:

- Left panel: To-Do list and Add Event form
- Center panel: Monday-Friday weekly calendar board
- Right panel: AI agent chat for schedule recommendations and edits

The project is now branded as **AlignAI**, an AI‑powered calendar assistant.

## 1) Prerequisites

- Node.js 18+
- A Google OAuth 2.0 Client from Google Cloud Console
  - Authorized redirect URI: `http://localhost:4000/auth/callback` (the server also accepts `/oauth2callback` for compatibility)
- OpenAI API key (for AI chat)

## 2) Install and Run

```bash
# backend (api-only)
cd backend
cp .env.example .env
# Fill in .env (Google OAuth + OpenAI key)
npm install
npm start             # launches server on port 4000
```

```bash
# frontend (react ui)
cd frontend
npm install        # don't forget react-router-dom
npm start
```

Now visit the React app in the browser at:

- `http://localhost:3000`

The login screen appears first; after signing in with Google you'll be redirected to `/home` where calendar events are displayed.

> **Note:** the backend no longer serves static files—the UI lives entirely under `frontend/`.


## 3) Main Features

- Google OAuth login/logout
- Weekly events view (Monday-Friday)
- Manual event create/update/delete
- Local-storage To-Do list
- AI agent chat:
  - Analyze schedule
  - Suggest new events
  - Propose event updates/deletes
  - Apply suggestions directly

## 4) API Summary

- `GET /api/me` Check auth status
- `GET /auth/login` Start Google OAuth
- `GET /auth/callback` Google OAuth callback (also responds at `/oauth2callback` for older clients)
- `POST /auth/logout` Logout
- `GET /api/week-events?weekOffset=0` Get weekly events
- `POST /api/events` Create an event
- `PUT /api/events/:eventId` Update an event
- `DELETE /api/events/:eventId` Delete an event
- `POST /api/ai/chat` AI recommendations and edit proposals (the “AlignAI” agent)


## 5) Notes

- Session/token storage is in-memory, so authentication resets after server restart.
- This is an MVP for hackathon use. For production, add persistent sessions, user isolation, and audit logs.
