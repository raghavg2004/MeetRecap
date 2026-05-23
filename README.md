<h1 style="display:flex; align-items:center; gap:16px;">
	<img src="public/icon.png" alt="MeetRecap" width="100" />
	<span>MeetRecap - Smart Video Meeting &amp; AI Recap Platform with PWA</span>
</h1>

MeetRecap is a login-first multi-user video meeting prototype with live captions and downloadable meeting recaps (MOM PDFs). It includes a Progressive Web App (PWA) configuration for installable, offline-capable use.

This README reflects the current workflow, debugging additions, and PDF rendering fixes applied during development.

**Key capabilities**
- WebRTC peer-to-peer video + audio (mesh) with mic/camera controls and screen sharing
- Socket.IO signaling and realtime chat
- Browser-side speech recognition (Web Speech API) for live captions in English and Hindi
- Meeting recaps (MOM) saved and downloadable as PDF (PDFs now embed a Devanagari-capable font for correct Hindi rendering)

**Important fixes / notes made recently**
- Added debug logging around getUserMedia to help diagnose microphone/permission issues.
- Browser speech recognition is used for live transcripts (Chrome/Edge recommended).
- PDF generator now embeds `assets/fonts/NotoSansDevanagari.ttf` (falls back to Windows fonts when available) so Hindi (Devanagari) text renders correctly in PDFs.
- Removed an unavailable `sanscript` dependency; transliteration to Hinglish was not added to avoid introducing a broken package.

## Tech stack
- Node.js + Express
- Socket.IO
- WebRTC (browser APIs)
- PDF generation with `pdfkit`
- Frontend: plain HTML/CSS/JS

## Quick start (local)
1. Clone the repo and open the project folder.

2. Install dependencies:

```powershell
cd "C:\Users\Raghav\Desktop\MeetRecap"
npm install
```

Notes for Windows: some optional native modules (used by transitive deps) may require the Visual Studio "Desktop development with C++" workload for `node-gyp` builds. If `npm install` fails with `node-gyp` errors, either install the required build tools or run the app on WSL/Linux where builds are easier.

3. Start the server:

```powershell
npm start
```

4. Open the app in a Chromium-based browser (Chrome or Edge) for best speech recognition support:

```
http://localhost:3000
```

If running the server remotely, use an HTTPS URL (or tunnel via ngrok) so browser media permissions work correctly.

## Testing live captions and PDF recap
- Join/create a meeting and allow camera/microphone when prompted.
- Open DevTools Console and look for messages prefixed with `[MEDIA]` and `[STT]` (added debug logs).
- Speak in Hindi (Devanagari) or English — live captions should appear in the meeting UI.
- End/leave the meeting and download the MOM PDF from the UI; Hindi text should render correctly in the PDF due to the embedded Devanagari font.

## Configuration (env)
Set environment variables as appropriate for production:
- `PORT` — HTTP port (default 3000)
- `MAX_ROOM_SIZE` — max participants in a room (default 12)
- `ALLOWED_ORIGIN` — Socket.IO allowed origin
- `SESSION_SECRET`, `JWT_SECRET`, `JWT_EXPIRES_IN`
- `GMAIL_USER` and `GMAIL_APP_PASSWORD` — optional for sending personal recap emails via Gmail
- `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` — optional TURN server settings for NAT traversal

## Troubleshooting
- If you see no audio capture: ensure you allowed microphone permission, use localhost or HTTPS, and check DevTools console for `[MEDIA]` logs.
- If browser speech recognition is not supported: use Chrome or Edge; Firefox does not fully support the Web Speech API.
- If `npm install` fails with `node-gyp`/`ffi-napi` errors on Windows: install Visual Studio Build Tools or run on WSL/Linux.
- If PDF contains garbled characters for Hindi: confirm `assets/fonts/NotoSansDevanagari.ttf` exists and server restarted after the change; the app now prefers this bundled font.

## Development notes & next steps
- Consider adding an optional UI toggle to switch between original Devanagari and Latin (Hinglish) transliteration.
- For scale, replace mesh WebRTC with an SFU (mediasoup/jitsi) and persist recaps in a database.

---

If you want, I can also add a short troubleshooting panel in the meeting UI that displays microphone track status and speech recognition state. Tell me if you'd like that added.

