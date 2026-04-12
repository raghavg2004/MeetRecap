# MeetRecap

MeetRecap is a login-first multi-user video calling platform with a dashboard for creating, joining, scheduling, and tracking meetings.

## Features

- Login and register flow
- Dashboard after login
- Instant meetings with host approval
- Meeting links with scheduled lobby gating
- Schedule upcoming meetings
- Meeting history tracking
- JWT + session authentication
- Multi-user video/audio with WebRTC
- Mic/camera controls and screen sharing
- In-meeting realtime chat
- Responsive mobile-first UI

## Tech Stack

- Node.js + Express
- Socket.IO for signaling
- WebRTC for peer-to-peer media
- HTML/CSS/JavaScript frontend

## Local Setup

1. Install dependencies:

   npm install

2. Start the server:

   npm start

3. Open in browser:

   http://localhost:3000

## Production Configuration

Environment variables used by the app:

- PORT: HTTP port, default `3000`
- MAX_ROOM_SIZE: max participants per room, default `12`
- ALLOWED_ORIGIN: allowed Socket.IO origin
- SESSION_SECRET: secret for session signing
- JWT_SECRET: secret for JWT signing
- JWT_EXPIRES_IN: token expiry, default `12h`
- TURN_URL: TURN server URL, for example `turn:turn.example.com:3478`
- TURN_USERNAME: TURN username
- TURN_CREDENTIAL: TURN credential/secret

## Deployment Notes

This app uses a Socket.IO/WebRTC meeting server, so the full stack cannot run on Vercel alone.

Recommended split deployment:

1. Frontend on Vercel
   - Deploy the repository as a Vercel project.
   - Set these Vercel environment variables:
     - `BACKEND_ORIGIN`: your backend base URL, for example `https://your-backend.onrender.com`
     - `SOCKET_ORIGIN`: same as backend URL if Socket.IO runs on the backend host

2. Backend on a Node host
   - Deploy `server.js` to Render, Railway, Fly.io, or any Node host with WebSocket support.
   - Set backend environment variables:
     - `ALLOWED_ORIGIN`: your Vercel site URL, for example `https://your-app.vercel.app`
     - `SESSION_SECRET`
     - `JWT_SECRET`
     - `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` if you use TURN

The frontend reads runtime config from `/api/app-config` on Vercel and falls back to same-origin when running locally.

## Push to GitHub

```bash
git remote add origin https://github.com/raghavg2004/MeetRecap.git
git branch -M main
git push -u origin main
```

## Notes

- Current authentication, schedule, and history storage are in-memory for this project scaffold.
- For true production persistence, connect users/rooms/meetings to a database and shared cache.
- This uses a mesh WebRTC architecture, suitable for small groups.
- For larger meetings, use an SFU such as mediasoup, Janus, or Jitsi.
