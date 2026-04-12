# Multi VideoCall Platform (Meeting ID Based)

A login-first multi-user video calling platform with a dashboard for creating, joining, scheduling, and tracking meetings.

## Features

- Proper login/register page
- User dashboard after login
- Create instant meetings
- Join meetings by Meeting ID
- Join by shared link (`?meeting=MEETING_ID`)
- Schedule upcoming meetings
- Meeting history tracking
- Account authentication with email/password
- JWT + session support for authenticated access
- Multi-user video + audio with WebRTC
- Mute/unmute mic, camera on/off, screen sharing
- In-meeting realtime chat
- Host controls for mute/remove participant
- Lock meeting button removed from UI
- Responsive UI for desktop and mobile

## Tech Stack

- Node.js + Express
- Socket.IO for signaling
- WebRTC for peer-to-peer media
- HTML/CSS/JavaScript frontend

## Setup

1. Install dependencies:

   npm install

2. Start the server:

   npm start

3. Open in browser:

   http://localhost:3000

## Production Configuration

Use environment variables to tune deployment behavior:

- PORT: HTTP port (default: 3000)
- MAX_ROOM_SIZE: max participants per room (default: 12)
- ALLOWED_ORIGIN: allowed Socket.IO origin (default: same origin)
- SESSION_SECRET: secret for session signing
- JWT_SECRET: secret for JWT signing
- JWT_EXPIRES_IN: token expiry (default: 12h)
- TURN_URL: TURN server URL, example `turn:turn.example.com:3478`
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

To push to GitHub:

1. Create a GitHub repository.
2. Add it as a remote.
3. Push the repo normally with Git.

Example:

   git remote add origin https://github.com/<your-user>/<your-repo>.git
   git branch -M main
   git push -u origin main

Example (PowerShell):

   $env:TURN_URL="turn:turn.example.com:3478"
   $env:TURN_USERNAME="turn-user"
   $env:TURN_CREDENTIAL="turn-password"
   $env:SESSION_SECRET="replace-with-long-random-secret"
   $env:JWT_SECRET="replace-with-long-random-secret"
   npm start

## Notes

- Current authentication, schedule, and history storage are in-memory for this project scaffold.
- For true production persistence, connect users/rooms/meetings to a database and shared cache.
- This uses a mesh WebRTC architecture, suitable for small groups.
- For larger meetings, use an SFU (like mediasoup/Janus/Jitsi stack).
- For production-grade reliability across NAT/firewalls, configure TURN.
