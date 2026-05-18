const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const { Server } = require("socket.io");
const { execFile } = require("child_process");
// Prefer an embedded ffmpeg binary (ffmpeg-static) if available so ffmpeg
// is available even when not installed system-wide.
let ffmpegBinaryPath = null;
try {
  const ffmpegStatic = require("ffmpeg-static");
  if (ffmpegStatic) {
    ffmpegBinaryPath = ffmpegStatic;
    console.log(`[FFmpeg] Using ffmpeg-static at ${ffmpegStatic}`);
  }
} catch (e) {
  console.log("[FFmpeg] ffmpeg-static not installed; ensure ffmpeg is on PATH");
}
const { execSync } = require("child_process");

// Transliteration feature removed; transcripts remain in original text (Devanagari if spoken)

let Vosk = null;
let vosk_recognizers = new Map();

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 3000);
const MAX_ROOM_SIZE = Number(process.env.MAX_ROOM_SIZE || 12);
const DATA_DIR = path.join(__dirname, "data");
const DEVANAGARI_PDF_FONT_PATH = path.join(__dirname, "assets", "fonts", "NotoSansDevanagari.ttf");
const WINDOWS_FONT_CANDIDATES = [
  DEVANAGARI_PDF_FONT_PATH,
  "C:\\Windows\\Fonts\\Nirmala.ttc",
  "C:\\Windows\\Fonts\\Nirmala.ttf",
  "C:\\Windows\\Fonts\\Mangal.ttf",
  "C:\\Windows\\Fonts\\Aparaj.ttf",
  "C:\\Windows\\Fonts\\Kokila.ttf",
];

function findDevanagariFontPath() {
  for (const fontPath of WINDOWS_FONT_CANDIDATES) {
    try {
      if (fs.existsSync(fontPath)) {
        return fontPath;
      }
    } catch {
      // Keep trying the next candidate.
    }
  }

  return null;
}

function configureRecapPdfFonts(doc) {
  const devanagariFontPath = findDevanagariFontPath();
  if (devanagariFontPath) {
    doc.registerFont("Devanagari", devanagariFontPath);
    doc.registerFont("Devanagari-Bold", devanagariFontPath);
    doc.font("Devanagari");
    console.log(`[PDF] Using Devanagari font: ${devanagariFontPath}`);
    return { fontName: "Devanagari", boldFontName: "Devanagari-Bold" };
  }

  console.warn("[PDF] No Devanagari font found; falling back to Helvetica");
  doc.font("Helvetica");
  return { fontName: "Helvetica", boldFontName: "Helvetica-Bold" };
}
const USERS_FILE = path.join(DATA_DIR, "user.json");
const LEGACY_USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret-change-me";
const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";
const GMAIL_USER = sanitizeEmail(process.env.GMAIL_USER || "projectonnet11@gmail.com");
const GMAIL_APP_PASSWORD = String(process.env.GMAIL_APP_PASSWORD || "dyjn senq xxdv xsya").replace(/\s+/g, "");
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_TRANSCRIBE_MODEL = String(process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1").trim() || "whisper-1";
const OPENAI_BASE_URL = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
const OPENAI_TRANSCRIBE_LANGUAGE = String(process.env.OPENAI_TRANSCRIBE_LANGUAGE || "").trim();
const GROQ_API_KEY = String(process.env.GROQ_API_KEY || "").trim();
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_TRANSCRIBE_MODEL = String(process.env.GROQ_TRANSCRIBE_MODEL || "whisper-large-v3-turbo").trim();
const WIT_AI_TOKEN = String(process.env.WIT_AI_TOKEN || "").trim();
const ENABLE_VOSK_TRANSCRIPTION = false;
const TRANSCRIPTION_CHUNK_MS = Math.max(5000, Number(process.env.TRANSCRIPTION_CHUNK_MS || 15000) || 15000);
const VOSK_MODEL_PATH = String(process.env.VOSK_MODEL_PATH || path.join(__dirname, "vosk-model-en-us-0.42-gigaspeech")).trim();
const VOSK_HINDI_MODEL_PATH = String(process.env.VOSK_HINDI_MODEL_PATH || "").trim();
const SUPPORTED_TRANSCRIPTION_LANGUAGES = String(process.env.SUPPORTED_TRANSCRIPTION_LANGUAGES || "en,hi").trim().toLowerCase().split(",").map(l => l.trim()).filter(l => l);
const ENABLE_FALLBACK_TRANSCRIPTION = process.env.ENABLE_FALLBACK_TRANSCRIPTION === "true";

const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN || true,
  },
});

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || true,
  credentials: true,
}));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

// ──── PWA Configuration ────────────────────────────────────────────
// Set MIME type for manifest.json
app.use((req, res, next) => {
  if (req.url === '/manifest.json') {
    res.type('application/manifest+json');
  }
  // Set cache control headers
  if (req.url === '/service-worker.js') {
    // Service workers should not be cached too long to ensure updates
    res.setHeader('Cache-Control', 'max-age=3600, public');
    res.type('application/javascript');
  } else if (req.url === '/manifest.json') {
    res.setHeader('Cache-Control', 'max-age=86400, public');
  } else if (req.url.match(/\.(js|css|png|jpg|gif|svg|woff|woff2|ttf|eot)$/)) {
    // Cache static assets for 1 week
    res.setHeader('Cache-Control', 'max-age=604800, public');
  } else if (req.url.match(/\.(html)$/)) {
    // HTML files: cache for 1 hour to allow fresh content
    res.setHeader('Cache-Control', 'max-age=3600, public, must-revalidate');
  }
  
  // PWA Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/meeting", (req, res) => {
  const meetingId = sanitizeMeetingId(req.query?.meeting);
  if (!meetingId) {
    res.redirect("/dashboard");
    return;
  }

  res.sendFile(path.join(__dirname, "public", "meeting.html"));
});

app.get("/meeting/:meetingId", (req, res) => {
  const meetingId = sanitizeMeetingId(req.params?.meetingId);
  if (!meetingId) {
    res.redirect("/dashboard");
    return;
  }

  res.redirect(`/meeting?meeting=${encodeURIComponent(meetingId)}`);
});

const usersByEmail = new Map();
const usersById = new Map();
const meetingsByUser = new Map();
const meetingHistoryByUser = new Map();
const endedMeetingsByRoom = new Map();
const rooms = new Map();
const RECAP_RETENTION_MS = Number(process.env.RECAP_RETENTION_MS || 1000 * 60 * 60 * 24);
let transcriptionDisabled = false;

function ensureUsersFileExists() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    if (fs.existsSync(LEGACY_USERS_FILE)) {
      fs.copyFileSync(LEGACY_USERS_FILE, USERS_FILE);
    } else {
      fs.writeFileSync(USERS_FILE, "[]\n", "utf8");
    }
  }
}

function loadUsersFromDisk() {
  ensureUsersFileExists();

  let rawUsers = [];
  try {
    const fileContents = fs.readFileSync(USERS_FILE, "utf8");
    const parsedUsers = JSON.parse(fileContents);
    rawUsers = Array.isArray(parsedUsers) ? parsedUsers : [];
  } catch (error) {
    console.error("Failed to load users from disk:", error);
    rawUsers = [];
  }

  usersByEmail.clear();
  usersById.clear();
  meetingHistoryByUser.clear();

  for (const user of rawUsers) {
    if (!user || typeof user !== "object") {
      continue;
    }

    if (!user.id || !user.email || !user.passwordHash) {
      continue;
    }

    const normalizedUser = {
      id: String(user.id),
      email: sanitizeEmail(String(user.email)),
      displayName: sanitizeDisplayName(String(user.displayName || "")),
      passwordHash: String(user.passwordHash),
      createdAt: Number.isFinite(Number(user.createdAt)) ? Number(user.createdAt) : Date.now(),
    };

    if (!normalizedUser.email || !normalizedUser.displayName) {
      continue;
    }

    usersByEmail.set(normalizedUser.email, normalizedUser);
    usersById.set(normalizedUser.id, normalizedUser);

    // Restore meeting history for this user
    if (Array.isArray(user.meetingHistory) && user.meetingHistory.length > 0) {
      meetingHistoryByUser.set(normalizedUser.id, user.meetingHistory);
    }
  }
}

function saveUsersToDisk() {
  ensureUsersFileExists();

  const users = Array.from(usersById.values())
    .map(user => ({
      ...user,
      meetingHistory: meetingHistoryByUser.get(user.id) || []
    }))
    .sort((left, right) => left.createdAt - right.createdAt);
  fs.writeFileSync(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, "utf8");
}

loadUsersFromDisk();

function sanitizeMeetingId(roomId) {
  if (typeof roomId !== "string") {
    return "";
  }

  const cleaned = roomId.trim().toUpperCase();
  return /^[A-Z0-9-]{4,32}$/.test(cleaned) ? cleaned : "";
}

function sanitizeDisplayName(username) {
  if (typeof username !== "string") {
    return "";
  }

  const cleaned = username.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 24) {
    return "";
  }

  return cleaned.replace(/[<>]/g, "");
}

function sanitizeEmail(email) {
  if (typeof email !== "string") {
    return "";
  }

  const cleaned = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : "";
}

function sanitizeChatMessage(text) {
  if (typeof text !== "string") {
    return "";
  }

  const cleaned = text.trim();
  if (!cleaned || cleaned.length > 1000) {
    return "";
  }

  return cleaned.replace(/[<>]/g, "");
}

function sanitizeSupportQuestion(question) {
  if (typeof question !== "string") {
    return "";
  }

  const cleaned = question.trim().replace(/\r\n/g, "\n");
  if (!cleaned || cleaned.length > 2000) {
    return "";
  }

  return cleaned.replace(/[<>]/g, "");
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function buildSupportEmailHTML({ userName, userEmail, question }) {
  const safeName = escapeHtml(userName || "there");
  const safeEmail = escapeHtml(userEmail || "");
  const safeQuestion = escapeHtml(question || "").replace(/\n/g, "<br />");
  const year = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MeetRecap Support</title>
</head>
<body style="margin:0;padding:0;background:#07111f;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:linear-gradient(180deg,#07111f 0%,#09192f 48%,#0b2441 100%);padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:700px;background:#0d1728;border:1px solid rgba(255,255,255,0.08);border-radius:22px;overflow:hidden;box-shadow:0 22px 60px rgba(0,0,0,0.38);">
          <tr>
            <td style="padding:24px 28px;background:linear-gradient(135deg,#0f4c81 0%,#06b6d4 52%,#22c55e 100%);color:#fff;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.88);font-weight:700;">MeetRecap Teams Support</div>
                    <div style="font-size:28px;line-height:1.15;font-weight:800;margin-top:8px;">We received your question</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 28px 16px;">
              <p style="margin:0 0 8px;color:#8ed2ff;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;">Support Message</p>
              <h2 style="margin:0 0 14px;color:#f4f8ff;font-size:22px;line-height:1.35;">Hi ${safeName}, we’re reviewing your message now.</h2>
              <p style="margin:0 0 20px;color:#c8d4e5;font-size:14px;line-height:1.8;">Thank you for contacting MeetRecap. Our support team is checking your request and will reply as soon as possible.</p>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 18px;border-collapse:separate;">
                <tr>
                  <td style="padding:18px;background:#101d31;border:1px solid rgba(255,255,255,0.08);border-radius:16px;">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8ed2ff;margin-bottom:10px;">Your Question</div>
                    <div style="color:#e8eef8;font-size:14px;line-height:1.75;word-break:break-word;white-space:normal;">${safeQuestion.replace(/\n/g, "<br />")}</div>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 8px;">
                <tr>
                  <td style="padding:18px;background:#0b1424;border:1px solid rgba(255,255,255,0.06);border-radius:16px;color:#b6c6d8;font-size:13px;line-height:1.75;">
                    <strong style="color:#fff;">MeetRecap at a glance:</strong><br />
                    Web meetings, scheduling, live chat, quick join links, and team collaboration tools built for fast remote sessions.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px 26px;background:#0a1424;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <div style="font-size:12px;color:#b6c6d8;line-height:1.7;">
                MeetRecap Teams Support<br />
                Need help? Reply to this email and our team will follow up.
              </div>
              <div style="margin-top:8px;font-size:11px;color:#71839c;">© ${year} MeetRecap. All rights reserved.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function sanitizeMeetingTitle(title) {
  if (typeof title !== "string") {
    return "";
  }

  const cleaned = title.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 60) {
    return "";
  }

  return cleaned.replace(/[<>]/g, "");
}

function getRequestAuthUser(req) {
  const bearer = req.headers.authorization;
  if (bearer && bearer.startsWith("Bearer ")) {
    const token = bearer.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = usersById.get(decoded.sub);
      if (user) {
        return user;
      }
    } catch {
      return null;
    }
  }

  if (req.session?.userId) {
    return usersById.get(req.session.userId) || null;
  }

  return null;
}

function requireAuth(req, res, next) {
  const user = getRequestAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.authUser = user;
  next();
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

function issueToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

function listForUser(map, userId) {
  if (!map.has(userId)) {
    map.set(userId, []);
  }

  return map.get(userId);
}

function sanitizeTranscriptText(text) {
  if (typeof text !== "string") {
    return "";
  }

  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 2000) {
    return "";
  }

  return cleaned.replace(/[<>]/g, "");
}

function sanitizeTranscriptLanguage(language) {
  if (typeof language !== "string") {
    return "";
  }

  const cleaned = language.trim();
  return /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(cleaned) ? cleaned : "";
}

function mimeTypeToExtension(mimeType) {
  const type = String(mimeType || "").toLowerCase();
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mp4") || type.includes("m4a")) return "m4a";
  if (type.includes("wav")) return "wav";
  return "webm";
}

// Initialize Vosk models for supported languages.
// A new recognizer is created per request to avoid shared recognizer state across users.
function initializeVoskModels() {
  if (!Vosk) {
    return new Map();
  }

  const models = new Map();
  const languageModels = {
    "en": VOSK_MODEL_PATH,
    "hi": VOSK_HINDI_MODEL_PATH,
  };

  for (const [lang, modelPath] of Object.entries(languageModels)) {
    if (!modelPath || !SUPPORTED_TRANSCRIPTION_LANGUAGES.includes(lang)) {
      continue;
    }

    try {
      const resolvedPath = path.isAbsolute(modelPath) ? modelPath : path.join(__dirname, modelPath);

      if (!fs.existsSync(resolvedPath)) {
        console.warn(`[Vosk] ${lang.toUpperCase()} model not found at: ${resolvedPath}`);
        if (lang === "en") {
          console.warn("[Vosk] Download from: https://alphacephei.com/vosk/models");
        } else if (lang === "hi") {
          console.warn("[Vosk] To add Hindi support, see HINDI_SETUP.md");
        }
        continue;
      }

      const model = new Vosk.Model(resolvedPath);
      models.set(lang, model);
      console.log(`[Vosk] ${lang.toUpperCase()} model loaded: ${resolvedPath}`);
    } catch (error) {
      console.error(`[Vosk] Failed to initialize ${lang.toUpperCase()}: ${error.message}`);
    }
  }

  return models;
}

function createVoskRecognizer(language = "en") {
  const lang = String(language || "en").toLowerCase().slice(0, 2);

  if (vosk_recognizers.size === 0) {
    return null;
  }

  const model = vosk_recognizers.get(lang) || vosk_recognizers.get("en") || Array.from(vosk_recognizers.values())[0] || null;
  if (!model) {
    return null;
  }

  return new Vosk.Recognizer({ model, sampleRate: 16000 });
}

function looksLikeWav(buffer, mimeType) {
  const type = String(mimeType || "").toLowerCase();
  if (type.includes("wav")) {
    return true;
  }

  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return false;
  }

  return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";
}

function convertWavTo16kMonoPcm(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
    throw new Error("Invalid WAV buffer");
  }

  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Unsupported WAV header");
  }

  let offset = 12;
  let audioFormat = 0;
  let numChannels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;

    if (chunkId === "fmt " && chunkDataStart + 16 <= buffer.length) {
      audioFormat = buffer.readUInt16LE(chunkDataStart);
      numChannels = buffer.readUInt16LE(chunkDataStart + 2);
      sampleRate = buffer.readUInt32LE(chunkDataStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkDataStart + 14);
    } else if (chunkId === "data") {
      dataOffset = chunkDataStart;
      dataSize = Math.min(chunkSize, Math.max(0, buffer.length - chunkDataStart));
      break;
    }

    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }

  if (audioFormat !== 1) {
    throw new Error(`Unsupported WAV format: ${audioFormat}`);
  }
  if (numChannels < 1 || numChannels > 2) {
    throw new Error(`Unsupported WAV channels: ${numChannels}`);
  }
  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`);
  }
  if (sampleRate <= 0 || dataOffset < 0 || dataSize <= 0) {
    throw new Error("Corrupt WAV data");
  }

  const bytesPerFrame = numChannels * 2;
  const frameCount = Math.floor(dataSize / bytesPerFrame);
  if (frameCount <= 0) {
    throw new Error("Empty WAV audio");
  }

  // Mix to mono as float [-1, 1]
  const mono = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const frameOffset = dataOffset + i * bytesPerFrame;
    const left = buffer.readInt16LE(frameOffset) / 32768;
    const right = numChannels === 2 ? buffer.readInt16LE(frameOffset + 2) / 32768 : left;
    mono[i] = (left + right) * 0.5;
  }

  // Resample to 16k using linear interpolation
  const targetRate = 16000;
  if (sampleRate === targetRate) {
    const out = Buffer.allocUnsafe(frameCount * 2);
    for (let i = 0; i < frameCount; i++) {
      const s = Math.max(-1, Math.min(1, mono[i]));
      const v = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
      out.writeInt16LE(v, i * 2);
    }
    return out;
  }

  const outLength = Math.max(1, Math.floor((frameCount * targetRate) / sampleRate));
  const out = Buffer.allocUnsafe(outLength * 2);
  const ratio = sampleRate / targetRate;

  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const leftIndex = Math.floor(srcPos);
    const rightIndex = Math.min(frameCount - 1, leftIndex + 1);
    const frac = srcPos - leftIndex;
    const sample = mono[leftIndex] * (1 - frac) + mono[rightIndex] * frac;
    const s = Math.max(-1, Math.min(1, sample));
    const v = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    out.writeInt16LE(v, i * 2);
  }

  return out;
}

async function convertWithFfmpegToPcm(buffer, mimeType) {
  const ext = mimeTypeToExtension(mimeType || "audio/webm");
  const tempBase = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tempInputPath = path.join(__dirname, `${tempBase}_input.${ext}`);
  const tempOutputPath = path.join(__dirname, `${tempBase}_output.pcm`);

  const cleanupTempFiles = () => {
    try {
      if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
    } catch {}
  };

  if (!ffmpegBinaryPath) {
    throw new Error("ffmpeg binary is unavailable");
  }

  try {
    fs.writeFileSync(tempInputPath, buffer);

    await new Promise((resolve, reject) => {
      execFile(
        ffmpegBinaryPath,
        [
          "-y",
          "-i",
          tempInputPath,
          "-ac",
          "1",
          "-ar",
          "16000",
          "-f",
          "s16le",
          tempOutputPath,
        ],
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        },
      );
    });

    const pcmBuffer = fs.readFileSync(tempOutputPath);
    cleanupTempFiles();
    return pcmBuffer;
  } catch (error) {
    cleanupTempFiles();
    throw error;
  }
}

async function convertAudioToPcm(buffer, mimeType) {
  if (looksLikeWav(buffer, mimeType)) {
    try {
      return convertWavTo16kMonoPcm(buffer);
    } catch (error) {
      console.warn(`[Vosk] WAV decode failed, falling back to ffmpeg: ${error.message}`);
    }
  }

  return convertWithFfmpegToPcm(buffer, mimeType);
}

// Transcribe using Vosk with raw PCM input (required by Vosk recognizer).
async function transcribeWithVosk(buffer, mimeType, language = "en") {
  const recognizer = createVoskRecognizer(language);
  if (!recognizer) {
    console.log(`[Vosk] No recognizer available for language: ${language}`);
    return null;
  }

  try {
    console.log(`[Vosk] Processing audio (${language.toUpperCase()}), buffer size: ${buffer.length}, MIME: ${mimeType}`);

    const pcmBuffer = await convertAudioToPcm(buffer, mimeType);
    console.log(`[Vosk] PCM conversion complete, size: ${pcmBuffer.length}`);

    const hasFinalResult = recognizer.acceptWaveform(pcmBuffer);
    if (hasFinalResult) {
      const parsed = JSON.parse(recognizer.result());
      const text = String(parsed?.text || "").trim();
      if (text) {
        console.log(`[Vosk] ${language.toUpperCase()} transcription success: ${text}`);
        return text;
      }
    }

    const partial = JSON.parse(recognizer.partialResult());
    const partialText = String(partial?.partial || "").trim();
    if (partialText) {
      console.log(`[Vosk] ${language.toUpperCase()} partial transcription: ${partialText}`);
      return partialText;
    }

    const final = JSON.parse(recognizer.finalResult());
    const finalText = String(final?.text || "").trim();
    if (finalText) {
      console.log(`[Vosk] ${language.toUpperCase()} final transcription: ${finalText}`);
      return finalText;
    }

    console.log(`[Vosk] No speech detected in audio (${language.toUpperCase()})`);
    return "";
  } catch (error) {
    console.error(`[Vosk] Processing error (${language}): ${error.message}`);
    throw new Error(`Vosk processing failed: ${error.message}`);
  } finally {
    try {
      recognizer.free();
    } catch {}
  }
}

// Generic Whisper-compatible transcription (works with OpenAI or Groq)
async function transcribeWithWhisperApi(buffer, mimeType, { apiKey, baseUrl, model, language }) {
  if (!apiKey) throw new Error("API key not configured");

  const baseMime = String(mimeType || "audio/webm").split(";")[0].trim().toLowerCase();
  let ext = "webm";
  if (baseMime.includes("wav")) ext = "wav";
  else if (baseMime.includes("ogg")) ext = "ogg";
  else if (baseMime.includes("mp4") || baseMime.includes("m4a")) ext = "mp4";
  else if (baseMime.includes("mp3")) ext = "mp3";
  else if (baseMime.includes("flac")) ext = "flac";

  const boundary = `----WhisperBoundary${Date.now().toString(16)}`;
  const CRLF = "\r\n";

  const headerPart = Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="file"; filename="audio.${ext}"${CRLF}` +
    `Content-Type: ${baseMime || "audio/webm"}${CRLF}` +
    CRLF
  );
  const modelPart = Buffer.from(
    `${CRLF}--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="model"${CRLF}` +
    CRLF +
    `${model}${CRLF}` +
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="response_format"${CRLF}` +
    CRLF +
    `json${CRLF}` +
    (language ? `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="language"${CRLF}` +
    CRLF +
    `${language}${CRLF}` : "") +
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="temperature"${CRLF}` +
    CRLF +
    `0${CRLF}` +
    `--${boundary}--${CRLF}`
  );

  // No language hint → auto-detects Hindi, English, and 97+ other languages
  const body = Buffer.concat([headerPart, buffer, modelPart]);
  const whisperUrl = `${baseUrl}/audio/transcriptions`;
  console.log(`[Whisper] POST ${whisperUrl} model=${model} size=${buffer.length} ext=${ext}`);

  const response = await new Promise((resolve, reject) => {
    const https = require("https");
    const http = require("http");
    const parsed = new URL(whisperUrl);
    const transport = parsed.protocol === "https:" ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + (parsed.search || ""),
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    };
    const req = transport.request(opts, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  if (response.status !== 200) {
    let errMsg = `Whisper API error ${response.status}`;
    try { errMsg = JSON.parse(response.body)?.error?.message || errMsg; } catch {}
    console.error(`[Whisper] ${baseUrl} error: ${errMsg}`);
    throw new Error(errMsg);
  }

  const text = String(JSON.parse(response.body)?.text || "").trim();
  console.log(`[Whisper] ${baseUrl} result: ${text || "(empty)"}`);
  return text;
}

async function transcribeAudioBuffer({ buffer, mimeType, language }) {
  const safeMimeType = String(mimeType || "audio/webm").split(";")[0].trim();
  console.log(`[Transcribe] Processing audio mimeType=${safeMimeType} size=${buffer.length}`);

  // 1) GROQ WHISPER — free tier, auto language detection, fast
  if (GROQ_API_KEY) {
    try {
      return await transcribeWithWhisperApi(buffer, safeMimeType, {
        apiKey: GROQ_API_KEY,
        baseUrl: GROQ_BASE_URL,
        model: GROQ_TRANSCRIBE_MODEL,
        language: language && language !== "auto" ? language : "",
      });
    } catch (err) {
      console.warn(`[Groq] Failed: ${err.message} — trying next backend`);
    }
  }

  // 2) OPENAI WHISPER — paid, auto language detection
  if (OPENAI_API_KEY) {
    try {
      return await transcribeWithWhisperApi(buffer, safeMimeType, {
        apiKey: OPENAI_API_KEY,
        baseUrl: OPENAI_BASE_URL,
        model: OPENAI_TRANSCRIBE_MODEL,
        language: language && language !== "auto" ? language : "",
      });
    } catch (err) {
      console.warn(`[OpenAI] Failed: ${err.message} — trying Vosk fallback`);
    }
  }

  // 3) VOSK OFFLINE — no API key, needs WAV audio from client
  if (ENABLE_VOSK_TRANSCRIPTION && vosk_recognizers.size > 0) {
    const requestedLang = sanitizeTranscriptLanguage(language || "") || "";
    const isAuto = !requestedLang || requestedLang.toLowerCase() === "auto";
    const tryLangs = isAuto
      ? [...vosk_recognizers.keys()]
      : [requestedLang.slice(0, 2).toLowerCase()];

    // Add any remaining supported languages not already in the list
    for (const l of SUPPORTED_TRANSCRIPTION_LANGUAGES) {
      const ll = l.slice(0, 2).toLowerCase();
      if (!tryLangs.includes(ll)) tryLangs.push(ll);
    }

    let bestText = "";
    for (const lang of tryLangs) {
      try {
        console.log(`[Vosk] Trying ${lang.toUpperCase()}...`);
        const text = await transcribeWithVosk(buffer, safeMimeType, lang);
        if (text && text.trim().length > (bestText.length || 0)) {
          bestText = text.trim();
          if (bestText.length > 10) break;
        }
      } catch (err) {
        console.warn(`[Vosk] ${lang} error: ${err.message}`);
      }
    }
    if (bestText) {
      console.log(`[Vosk] Result: ${bestText}`);
      return bestText;
    }
    return "";
  }

  if (!GROQ_API_KEY && !OPENAI_API_KEY && !ENABLE_VOSK_TRANSCRIPTION) {
    throw new Error("Transcription backend is not configured. Add GROQ_API_KEY to .env for free transcription.");
  }

  return "";
}

function detectAudioPresence(buffer) {
  // Simple heuristic: check if buffer has significant variation (indicates audio content)
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return false;
  }

  let sum = 0;
  let count = 0;
  const stride = Math.max(1, Math.floor(buffer.length / 1000)); // Sample every Nth byte

  for (let i = 0; i < buffer.length; i += stride) {
    sum += Math.abs(buffer[i] - 128); // Treat as unsigned 8-bit, center at 128
    count++;
  }

  const averageDeviation = count > 0 ? sum / count : 0;
  
  // If average deviation from silence is > threshold, consider it audio
  const hasSignificantAudio = averageDeviation > 10;
  
  console.log("[Fallback] Audio analysis - average deviation:", averageDeviation.toFixed(2), "has audio:", hasSignificantAudio);
  
  return hasSignificantAudio;
}

function formatDurationLabel(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function trimRecapEntries(entries, limit = 250) {
  if (!Array.isArray(entries) || entries.length <= limit) {
    return entries || [];
  }

  return entries.slice(entries.length - limit);
}

function getStoredMeetingRecap(roomId) {
  const recap = endedMeetingsByRoom.get(roomId);
  if (!recap) {
    return null;
  }

  if (recap.expiresAt && recap.expiresAt < Date.now()) {
    endedMeetingsByRoom.delete(roomId);
    return null;
  }

  return recap;
}

function buildMeetingRecap(room, details = {}) {
  const endedAt = Number.isFinite(Number(details.endedAt)) ? Number(details.endedAt) : Date.now();
  const participants = Array.from(room.participants.entries()).map(([socketId, participant]) => ({
    socketId,
    userId: participant.userId,
    username: participant.username,
    isHost: Boolean(participant.isHost),
    joinedAt: participant.joinedAt,
  }));
  const chatMessages = trimRecapEntries(room.chatMessages || []);
  const transcripts = trimRecapEntries(room.transcripts || []);
  const title = room.title || room.scheduledTitle || `Meeting ${room.roomId}`;

  return {
    roomId: room.roomId,
    title,
    startedAt: room.startedAt || endedAt,
    endedAt,
    endedBy: details.endedBy || room.endedBy || "",
    endedReason: details.reason || room.endedReason || "ended",
    durationMs: Math.max(0, endedAt - (room.startedAt || endedAt)),
    participantCount: participants.length,
    participants,
    chatMessages,
    transcripts,
    summary: {
      chatCount: chatMessages.length,
      transcriptCount: transcripts.length,
      speakerCount: new Set(transcripts.map((entry) => entry.username)).size,
    },
    generatedAt: Date.now(),
    expiresAt: Date.now() + RECAP_RETENTION_MS,
  };
}

function storeMeetingRecap(room, details = {}) {
  if (!room) {
    return null;
  }

  if (room.ended) {
    const existing = getStoredMeetingRecap(room.roomId);
    if (existing) {
      return existing;
    }
  }

  const recap = buildMeetingRecap(room, details);
  room.ended = true;
  room.endedAt = recap.endedAt;
  room.endedBy = recap.endedBy;
  room.endedReason = recap.endedReason;
  endedMeetingsByRoom.set(room.roomId, recap);
  return recap;
}

function buildPersonalRecap(room, participant, leftAt) {
  const endedAt = Number.isFinite(Number(leftAt)) ? Number(leftAt) : Date.now();
  const joinedAt = participant?.joinedAt || room.startedAt || endedAt;

  const transcripts = (room.transcripts || []).filter((t) => Number.isFinite(Number(t.timestamp)) && t.timestamp >= joinedAt && t.timestamp <= endedAt);
  const chatMessages = (room.chatMessages || []).filter((m) => Number.isFinite(Number(m.timestamp)) && m.timestamp >= joinedAt && m.timestamp <= endedAt);

  const title = room.title || room.scheduledTitle || `Meeting ${room.roomId}`;
  const startedAt = room.startedAt || joinedAt;
  const endedAtVal = endedAt;

  const participantsArr = [
    {
      socketId: "",
      userId: participant.userId,
      username: participant.username,
      isHost: Boolean(participant.isHost),
      joinedAt: participant.joinedAt || joinedAt,
    },
  ];

  const chatEntries = trimRecapEntries(chatMessages);
  const transcriptEntries = trimRecapEntries(transcripts);

  return {
    roomId: room.roomId,
    title,
    startedAt,
    endedAt: endedAtVal,
    endedBy: participant.username || "",
    endedReason: "left",
    durationMs: Math.max(0, endedAtVal - startedAt),
    participantCount: 1,
    participants: participantsArr,
    participant: participantsArr[0],
    chatMessages: chatEntries,
    transcripts: transcriptEntries,
    summary: {
      chatCount: chatEntries.length,
      transcriptCount: transcriptEntries.length,
      speakerCount: new Set(transcriptEntries.map((entry) => entry.username)).size,
    },
    generatedAt: Date.now(),
  };
}

function buildRecapPdf(doc, recap) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;
  const fonts = configureRecapPdfFonts(doc);

  const sectionTitle = (title) => {
    doc.moveDown(0.8);
    doc.fillColor("#0f172a").fontSize(14).font(fonts.boldFontName).text(title, left, doc.y, { width: pageWidth });
    doc.moveDown(0.2);
    doc.moveTo(left, doc.y).lineTo(left + pageWidth, doc.y).strokeColor("#d7dde8").lineWidth(0.8).stroke();
    doc.moveDown(0.6);
    doc.fillColor("#111827").font(fonts.fontName);
  };

  const writeList = (items, emptyText) => {
    if (!items.length) {
      doc.text(emptyText, { width: pageWidth });
      return;
    }

    items.forEach((item) => {
      doc.text(`• ${item}`, { width: pageWidth, indent: 8, lineGap: 3 });
    });
  };

  doc.font(fonts.boldFontName).fontSize(22).fillColor("#0f172a").text("Minutes of Meeting", { align: "center" });
  doc.moveDown(0.3);
  doc.font(fonts.fontName).fontSize(10).fillColor("#475569").text(`MeetRecap MOM for ${recap.title}`, { align: "center" });
  doc.moveDown(1.0);

  doc.fontSize(11).fillColor("#111827");
  doc.text(`Meeting ID: ${recap.roomId}`);
  doc.text(`Started: ${new Date(recap.startedAt).toLocaleString()}`);
  doc.text(`Ended: ${new Date(recap.endedAt).toLocaleString()}`);
  doc.text(`Duration: ${formatDurationLabel(recap.durationMs)}`);
  doc.text(`Participants: ${recap.participantCount}`);
  if (recap.endedBy) {
    doc.text(`Ended by: ${recap.endedBy}`);
  }

  sectionTitle("Participants");
  writeList(
    (Array.isArray(recap.participants) ? recap.participants : []).map((participant) => `${participant.username}${participant.isHost ? " (host)" : ""}`),
    "No participant data recorded.",
  );

  sectionTitle("Voice Transcript");
  if (!Array.isArray(recap.transcripts) || !recap.transcripts.length) {
    doc.text("No voice transcript was captured during this meeting.", { width: pageWidth });
  } else {
    recap.transcripts.forEach((entry) => {
      const time = new Date(entry.timestamp || recap.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      doc.font(fonts.boldFontName).text(`${time} - ${entry.username || "Participant"}`, { width: pageWidth });
      // Use original transcript text (Devanagari when spoken in Hindi)
      doc.font(fonts.fontName).text(entry.text || "", { width: pageWidth, indent: 14, lineGap: 3 });
      doc.moveDown(0.25);
    });
  }

  sectionTitle("Chat Log");
  if (!Array.isArray(recap.chatMessages) || !recap.chatMessages.length) {
    doc.text("No chat messages were sent during this meeting.", { width: pageWidth });
  } else {
    recap.chatMessages.forEach((entry) => {
      const time = new Date(entry.timestamp || recap.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      doc.font(fonts.boldFontName).text(`${time} - ${entry.username || "Participant"}`, { width: pageWidth });
      doc.font(fonts.fontName).text(entry.text || "", { width: pageWidth, indent: 14, lineGap: 3 });
      doc.moveDown(0.25);
    });
  }

  sectionTitle("Summary");
  writeList([
    `${recap.summary.transcriptCount} voice transcript entries captured`,
    `${recap.summary.chatCount} chat messages captured`,
    `${recap.summary.speakerCount} unique speaker names detected`,
  ], "No summary metrics available.");
}

function streamRecapPdf(res, recap) {
  const doc = new PDFDocument({ margin: 42, size: "A4", bufferPages: true });
  const filename = `MeetRecap-${recap.roomId}-MOM.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  doc.pipe(res);
  buildRecapPdf(doc, recap);
  doc.end();
}

function generateRecapPdfBuffer(recap) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 42, size: "A4", bufferPages: true });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));
      buildRecapPdf(doc, recap);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function sendPersonalRecapEmail(toEmail, recap) {
  if (!toEmail || !GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.log("Personal recap email skipped: email or SMTP not configured.");
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    const pdfBuffer = await generateRecapPdfBuffer(recap);
    const subject = `Your Meeting MOM — ${recap.title || recap.roomId}`;
    const plain = [`Hi ${recap.participant?.username || "there"},`, `Attached is your meeting MOM for ${recap.title || recap.roomId}.`, `Duration: ${formatDurationLabel(recap.durationMs)}`, "Thanks,", "MeetRecap Teams"].join("\n\n");
    const html = `<p>Hi ${escapeHtml(recap.participant?.username || "there")},</p><p>Attached is your meeting MOM for <strong>${escapeHtml(recap.title || recap.roomId)}</strong>.</p><p>Duration: ${escapeHtml(formatDurationLabel(recap.durationMs))}</p><p>Thanks,<br/>MeetRecap Teams</p>`;

    await transporter.sendMail({
      from: `"MeetRecap" <${GMAIL_USER}>`,
      to: toEmail,
      subject,
      text: plain,
      html,
      attachments: [
        { filename: `MeetRecap-${recap.roomId}-personal-MOM.pdf`, content: pdfBuffer },
      ],
    });

    console.log(`Personal recap emailed to ${toEmail} for room ${recap.roomId}`);
  } catch (err) {
    console.error("Failed to send personal recap email:", err);
  }
}

function getRecapForRoom(roomId) {
  const stored = getStoredMeetingRecap(roomId);
  if (stored) {
    return stored;
  }

  const room = rooms.get(roomId);
  if (!room) {
    return null;
  }

  if (room.ended) {
    return storeMeetingRecap(room, {
      endedAt: room.endedAt || Date.now(),
      endedBy: room.endedBy || "",
      reason: room.endedReason || "ended",
    });
  }

  return buildMeetingRecap(room, { endedAt: Date.now(), reason: "active" });
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      title: "",
      hostSocketId: "",
      startedAt: 0,
      ended: false,
      endedAt: 0,
      endedBy: "",
      endedReason: "",
      participants: new Map(),
      pendingRequests: new Map(),
      chatMessages: [],
      transcripts: [],
    });
  }

  return rooms.get(roomId);
}

function findScheduledMeetingByRoomId(roomId) {
  for (const meetings of meetingsByUser.values()) {
    const found = meetings.find((meeting) => meeting.roomId === roomId);
    if (found) {
      return found;
    }
  }

  return null;
}

function roomMeta(room) {
  const scheduled = findScheduledMeetingByRoomId(room.roomId);
  return {
    roomId: room.roomId,
    meetingEnded: Boolean(room.ended),
    hostSocketId: room.hostSocketId,
    startedAt: room.startedAt,
    participantCount: room.participants.size,
    pendingApprovalCount: room.pendingRequests.size,
    scheduledFor: scheduled?.scheduledFor || null,
    scheduledTitle: scheduled?.title || "",
  };
}

function participantPayload([socketId, participant]) {
  return {
    socketId,
    userId: participant.userId,
    username: participant.username,
    isHost: participant.isHost,
  };
}

function isSocketInSameRoom(socket, targetSocketId) {
  const roomId = socket.data.roomId;
  if (!roomId) {
    return false;
  }

  const room = rooms.get(roomId);
  if (!room) {
    return false;
  }

  return room.participants.has(targetSocketId);
}

function pendingRequestPayload([socketId, request]) {
  return {
    socketId,
    userId: request.userId,
    username: request.username,
    requestedAt: request.requestedAt,
  };
}

function emitPendingRequestsToHost(room) {
  if (!room.hostSocketId) {
    return;
  }

  io.to(room.hostSocketId).emit("join-requests-updated", {
    requests: Array.from(room.pendingRequests.entries()).map(pendingRequestPayload),
  });
}

function admitParticipant({ socket, room, username, isHost }) {
  const existingUsers = Array.from(room.participants.entries()).map(participantPayload);

  room.participants.set(socket.id, {
    userId: socket.data.authUser.id,
    username,
    isHost,
    joinedAt: Date.now(),
  });

  room.pendingRequests.delete(socket.id);

  socket.data.roomId = room.roomId;
  socket.data.pendingRoomId = "";
  socket.data.userId = socket.data.authUser.id;
  socket.data.username = username;
  socket.data.isHost = isHost;

  socket.join(room.roomId);
  socket.emit("existing-users", {
    selfSocketId: socket.id,
    users: existingUsers,
    roomMeta: roomMeta(room),
  });

  socket.to(room.roomId).emit("user-joined", {
    socketId: socket.id,
    userId: socket.data.authUser.id,
    username,
    isHost,
  });

  io.to(room.roomId).emit("room-meta-updated", roomMeta(room));
  emitPendingRequestsToHost(room);
}

// App Configuration Endpoint
app.get("/api/app-config", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    apiBaseUrl: process.env.BACKEND_ORIGIN || "",
    socketUrl: process.env.SOCKET_ORIGIN || process.env.BACKEND_ORIGIN || "",
    appName: "MeetRecap",
  });
});

app.post("/api/auth/register", async (req, res) => {
  const email = sanitizeEmail(req.body?.email);
  const displayName = sanitizeDisplayName(req.body?.displayName);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !displayName || password.length < 8 || password.length > 72) {
    res.status(400).json({ error: "Invalid register payload." });
    return;
  }

  if (usersByEmail.has(email)) {
    res.status(409).json({ error: "Email already exists." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    id: crypto.randomUUID(),
    email,
    displayName,
    passwordHash,
    createdAt: Date.now(),
  };

  usersByEmail.set(email, user);
  usersById.set(user.id, user);

  try {
    saveUsersToDisk();
  } catch (error) {
    usersByEmail.delete(email);
    usersById.delete(user.id);
    console.error("Failed to persist user registration:", error);
    res.status(500).json({ error: "Unable to save user data." });
    return;
  }

  req.session.userId = user.id;

  res.status(201).json({
    token: issueToken(user),
    user: publicUser(user),
  });
});

app.post("/api/auth/login", async (req, res) => {
  const email = sanitizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !password) {
    res.status(400).json({ error: "Invalid login payload." });
    return;
  }

  const user = usersByEmail.get(email);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  req.session.userId = user.id;
  res.json({
    token: issueToken(user),
    user: publicUser(user),
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.authUser) });
});

app.post("/api/send-email", requireAuth, async (req, res) => {
  const question = sanitizeSupportQuestion(req.body?.question || req.body?.message || req.body?.askQuestion);
  const targetEmail = sanitizeEmail(req.body?.email || req.body?.userEmail || req.authUser.email);

  if (!targetEmail || !question) {
    res.status(400).json({ error: "User email and question are required." });
    return;
  }

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    res.status(500).json({ error: "Gmail credentials are not configured." });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    const senderName = req.authUser.displayName || "MeetRecap user";

    await transporter.sendMail({
      from: `"MeetRecap Support" <${GMAIL_USER}>`,
      to: targetEmail,
      replyTo: GMAIL_USER,
      subject: `MeetRecap Teams Support - ${senderName}, we received your question`,
      text: [
        `Hi ${senderName},`,
        "",
        "Thanks for contacting MeetRecap Teams Support.",
        "We received your question and will get back to you shortly.",
        "",
        `Question: ${question}`,
        "",
        `Support email: ${GMAIL_USER}`,
      ].join("\n"),
      html: buildSupportEmailHTML({ userName: senderName, userEmail: targetEmail, question }),
    });

    res.json({ success: true, message: "Question sent" });
  } catch (error) {
    const authFailed = /Invalid login|Username and Password not accepted|EAUTH/i.test(String(error?.message || ""));
    if (authFailed) {
      res.status(500).json({ error: "Gmail login failed. Recheck GMAIL_USER and GMAIL_APP_PASSWORD." });
      return;
    }

    res.status(500).json({ error: "Could not send email right now. Please try again." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.post("/api/meetings/schedule", requireAuth, (req, res) => {
  const title = sanitizeMeetingTitle(req.body?.title);
  const roomId = sanitizeMeetingId(req.body?.roomId);
  const scheduledFor = Number(req.body?.scheduledFor);

  if (!title || !roomId || !Number.isFinite(scheduledFor) || scheduledFor <= Date.now()) {
    res.status(400).json({ error: "Invalid schedule payload." });
    return;
  }

  const entry = {
    id: crypto.randomUUID(),
    title,
    roomId,
    scheduledFor,
    createdAt: Date.now(),
  };

  const scheduled = listForUser(meetingsByUser, req.authUser.id);
  scheduled.push(entry);
  scheduled.sort((a, b) => a.scheduledFor - b.scheduledFor);

  res.status(201).json({ meeting: entry });
});

app.get("/api/meetings/scheduled", requireAuth, (req, res) => {
  const now = Date.now();
  const scheduled = listForUser(meetingsByUser, req.authUser.id).filter((m) => m.scheduledFor >= now);
  res.json({ meetings: scheduled });
});

app.post("/api/meetings/history", requireAuth, (req, res) => {
  const roomId = sanitizeMeetingId(req.body?.roomId);
  const title = sanitizeMeetingTitle(req.body?.title || "Instant meeting");
  const joinedAt = Number(req.body?.joinedAt);
  const leftAt = Number(req.body?.leftAt);

  if (!roomId || !Number.isFinite(joinedAt) || !Number.isFinite(leftAt) || leftAt < joinedAt) {
    res.status(400).json({ error: "Invalid history payload." });
    return;
  }

  const history = listForUser(meetingHistoryByUser, req.authUser.id);
  history.unshift({
    id: crypto.randomUUID(),
    roomId,
    title,
    joinedAt,
    leftAt,
    durationMs: leftAt - joinedAt,
  });

  if (history.length > 50) {
    history.length = 50;
  }

  saveUsersToDisk();
  res.status(201).json({ ok: true });
});

app.get("/api/meetings/history", requireAuth, (req, res) => {
  const history = listForUser(meetingHistoryByUser, req.authUser.id);
  res.json({ meetings: history });
});

app.get("/api/meetings/:roomId/recap", requireAuth, (req, res) => {
  const roomId = sanitizeMeetingId(req.params?.roomId);
  if (!roomId) {
    res.status(400).json({ error: "Invalid meeting ID." });
    return;
  }

  const recap = getRecapForRoom(roomId);
  if (!recap) {
    res.status(404).json({ error: "Meeting recap not found." });
    return;
  }

  res.json({ recap });
});

app.get("/api/meetings/:roomId/recap.pdf", requireAuth, (req, res) => {
  const roomId = sanitizeMeetingId(req.params?.roomId);
  if (!roomId) {
    res.status(400).json({ error: "Invalid meeting ID." });
    return;
  }

  const recap = getRecapForRoom(roomId);
  if (!recap) {
    res.status(404).json({ error: "Meeting recap not found." });
    return;
  }

  streamRecapPdf(res, recap);
});

app.get("/api/meetings/:roomId/personal-recap.pdf", requireAuth, async (req, res) => {
  const roomId = sanitizeMeetingId(req.params?.roomId);
  if (!roomId) {
    res.status(400).json({ error: "Invalid meeting ID." });
    return;
  }

  // Prefer stored recap if meeting ended
  const stored = getStoredMeetingRecap(roomId);
  if (stored) {
    const participantInfo = (stored.participants || []).find((p) => String(p.userId) === String(req.authUser.id));
    if (!participantInfo) {
      res.status(404).json({ error: "Personal recap not found for this user." });
      return;
    }

    const pseudoRoom = {
      roomId: stored.roomId,
      title: stored.title,
      startedAt: stored.startedAt,
      transcripts: stored.transcripts || [],
      chatMessages: stored.chatMessages || [],
    };

    const participant = {
      userId: participantInfo.userId,
      username: participantInfo.username,
      joinedAt: participantInfo.joinedAt || stored.startedAt || 0,
      isHost: Boolean(participantInfo.isHost),
    };

    try {
      const recap = buildPersonalRecap(pseudoRoom, participant, stored.endedAt || Date.now());
      const buffer = await generateRecapPdfBuffer(recap);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="MeetRecap-${recap.roomId}-personal-MOM.pdf"`);
      res.send(buffer);
      return;
    } catch (err) {
      console.error("Failed to stream personal recap PDF (stored):", err);
      res.status(500).json({ error: "Failed to generate PDF." });
      return;
    }
  }

  // Active room path
  const room = rooms.get(roomId);
  if (!room) {
    res.status(404).json({ error: "Meeting not found." });
    return;
  }

  const participantEntry = Array.from(room.participants.values()).find((p) => String(p.userId) === String(req.authUser.id));
  if (!participantEntry) {
    res.status(404).json({ error: "Personal recap not found for this user." });
    return;
  }

  try {
    const recap = buildPersonalRecap(room, participantEntry, Date.now());
    const buffer = await generateRecapPdfBuffer(recap);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="MeetRecap-${recap.roomId}-personal-MOM.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error("Failed to stream personal recap PDF (active):", err);
    res.status(500).json({ error: "Failed to generate PDF." });
  }
});

app.post(
  "/api/meetings/:roomId/transcribe",
  requireAuth,
  express.raw({ type: (req) => {
    const ct = String(req.headers["content-type"] || "").toLowerCase();
    return ct.startsWith("audio/") || ct === "application/octet-stream";
  }, limit: "25mb" }),
  async (req, res) => {
    const roomId = sanitizeMeetingId(req.params?.roomId);
    if (!roomId) {
      res.status(400).json({ error: "Invalid meeting ID." });
      return;
    }

    const room = rooms.get(roomId);
    if (!room || room.ended) {
      res.status(404).json({ error: "Meeting is no longer active." });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Audio payload is empty." });
      return;
    }

    const participantEntry = Array.from(room.participants.entries()).find(([, value]) => value.userId === req.authUser.id);
    if (!participantEntry) {
      res.status(403).json({ error: "You are not currently in this meeting." });
      return;
    }

    const [socketId, participant] = participantEntry;
    const speakerName = sanitizeDisplayName(participant.username || req.authUser?.displayName) || req.authUser?.displayName || "Participant";
    const audioLanguage = sanitizeTranscriptLanguage(req.headers["x-transcript-language"] || req.headers["x-language"] || OPENAI_TRANSCRIBE_LANGUAGE);
    const mimeType = String(req.headers["content-type"] || "audio/webm");

    try {
      const text = await transcribeAudioBuffer({
        buffer: req.body,
        mimeType,
        language: audioLanguage,
      });

      const safeText = sanitizeTranscriptText(text);
      if (!safeText) {
        res.json({ transcript: null });
        return;
      }

      const transcript = {
        id: `${Date.now()}-${req.authUser.id}-transcript`,
        socketId,
        userId: req.authUser.id,
        username: speakerName,
        text: safeText,
        timestamp: Date.now(),
        source: "stt-backend",
      };

      room.transcripts.push(transcript);
      room.transcripts = trimRecapEntries(room.transcripts);

      io.to(roomId).emit("voice-transcript", transcript);
      res.json({ transcript });
    } catch (error) {
      const message = String(error?.message || "");
      console.log("[Transcribe] Error caught:", message, "full error:", error);
      if (/not configured/i.test(message)) {
        res.status(503).json({ error: "Transcription backend is not configured." });
        return;
      }

      res.status(502).json({ error: message || "Transcription failed." });
    }
  },
);

app.get("/config", (req, res) => {
  const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

  const turnUrl = process.env.TURN_URL;
  const turnUsername = process.env.TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  res.json({
    iceServers,
    authRequired: true,
    transcription: {
      enabled: true,
      provider: "browser-web-speech",
      language: "",
      autoDetect: false,
      supportedLanguages: ["en-US", "hi-IN"],
    },
  });
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== "string") {
    next(new Error("Authentication required."));
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = usersById.get(decoded.sub);
    if (!user) {
      next(new Error("Invalid auth token."));
      return;
    }

    socket.data.authUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    };
    next();
  } catch {
    next(new Error("Authentication failed."));
  }
});

io.on("connection", (socket) => {
  socket.data._personalRecapSent = false;
  socket.on("join-room", ({ roomId, username }) => {
    const safeRoomId = sanitizeMeetingId(roomId);
    const safeUsername = sanitizeDisplayName(username) || socket.data.authUser.displayName;

    if (!safeRoomId) {
      socket.emit("error-message", "Invalid meeting ID.");
      return;
    }

    if (getStoredMeetingRecap(safeRoomId)) {
      socket.emit("join-rejected", { reason: "meeting-ended" });
      return;
    }

    const room = getRoom(safeRoomId);
    room.title = room.title || findScheduledMeetingByRoomId(safeRoomId)?.title || `Meeting ${safeRoomId}`;

    if (room.ended) {
      socket.emit("join-rejected", { reason: "meeting-ended" });
      return;
    }

    if (room.participants.has(socket.id)) {
      return;
    }

    if (room.participants.size >= MAX_ROOM_SIZE) {
      socket.emit("error-message", "This meeting is full.");
      return;
    }

    const scheduled = findScheduledMeetingByRoomId(safeRoomId);
    if (scheduled && Date.now() < scheduled.scheduledFor) {
      socket.data.pendingRoomId = safeRoomId;
      socket.emit("lobby-wait", {
        reason: "scheduled-not-started",
        scheduledFor: scheduled.scheduledFor,
        title: scheduled.title,
      });
      return;
    }

    const isHost = room.participants.size === 0;
    if (isHost) {
      room.hostSocketId = socket.id;
      room.startedAt = Date.now();
      room.title = room.title || `Meeting ${safeRoomId}`;
      admitParticipant({ socket, room, username: safeUsername, isHost: true });
      emitPendingRequestsToHost(room);
      return;
    }

    room.pendingRequests.set(socket.id, {
      userId: socket.data.authUser.id,
      username: safeUsername,
      requestedAt: Date.now(),
    });

    socket.data.pendingRoomId = safeRoomId;
    socket.emit("lobby-wait", {
      reason: "awaiting-host-approval",
      scheduledFor: scheduled?.scheduledFor || null,
      title: scheduled?.title || "",
    });

    emitPendingRequestsToHost(room);
  });

  socket.on("host-lobby-decision", ({ action, targetSocketId }) => {
    const roomId = socket.data.roomId;
    if (!roomId) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      return;
    }

    const hostParticipant = room.participants.get(socket.id);
    if (!hostParticipant?.isHost) {
      socket.emit("error-message", "Only host can approve requests.");
      return;
    }

    if (!targetSocketId || !room.pendingRequests.has(targetSocketId)) {
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (!targetSocket) {
      room.pendingRequests.delete(targetSocketId);
      emitPendingRequestsToHost(room);
      return;
    }

    const request = room.pendingRequests.get(targetSocketId);
    if (action === "approve") {
      if (room.participants.size >= MAX_ROOM_SIZE) {
        targetSocket.emit("join-rejected", { reason: "meeting-full" });
        targetSocket.data.pendingRoomId = "";
        room.pendingRequests.delete(targetSocketId);
        emitPendingRequestsToHost(room);
        return;
      }

      admitParticipant({
        socket: targetSocket,
        room,
        username: request.username,
        isHost: false,
      });
      targetSocket.emit("join-approved", { roomMeta: roomMeta(room) });
      return;
    }

    if (action === "reject") {
      room.pendingRequests.delete(targetSocketId);
      targetSocket.data.pendingRoomId = "";
      targetSocket.emit("join-rejected", { reason: "rejected-by-host", by: socket.data.username });
      emitPendingRequestsToHost(room);
    }
  });

  socket.on("offer", ({ to, description }) => {
    const room = rooms.get(socket.data.roomId);
    if (room?.ended) {
      return;
    }

    if (!isSocketInSameRoom(socket, to)) {
      return;
    }

    io.to(to).emit("offer", {
      from: socket.id,
      description,
    });
  });

  socket.on("answer", ({ to, description }) => {
    const room = rooms.get(socket.data.roomId);
    if (room?.ended) {
      return;
    }

    if (!isSocketInSameRoom(socket, to)) {
      return;
    }

    io.to(to).emit("answer", {
      from: socket.id,
      description,
    });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    const room = rooms.get(socket.data.roomId);
    if (room?.ended) {
      return;
    }

    if (!isSocketInSameRoom(socket, to)) {
      return;
    }

    io.to(to).emit("ice-candidate", {
      from: socket.id,
      candidate,
    });
  });

  socket.on("chat-message", ({ text }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const room = rooms.get(roomId);
    if (room?.ended) {
      socket.emit("error-message", "This meeting has ended.");
      return;
    }

    const safeText = sanitizeChatMessage(text);
    if (!safeText) {
      socket.emit("error-message", "Message is empty or too long.");
      return;
    }

    const message = {
      id: `${Date.now()}-${socket.id}`,
      socketId: socket.id,
      userId: socket.data.userId,
      username: socket.data.username,
      text: safeText,
      timestamp: Date.now(),
    };

    room.chatMessages.push(message);
    room.chatMessages = trimRecapEntries(room.chatMessages);

    io.to(roomId).emit("chat-message", message);
  });

  socket.on("voice-transcript", ({ text, timestamp }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const room = rooms.get(roomId);
    if (room?.ended) {
      return;
    }

    const safeText = sanitizeTranscriptText(text);
    if (!safeText) {
      return;
    }

    const transcript = {
      id: `${Date.now()}-${socket.id}-transcript`,
      socketId: socket.id,
      userId: socket.data.userId,
      username: socket.data.username,
      text: safeText,
      timestamp: Date.now(),
    };

    room.transcripts.push(transcript);
    room.transcripts = trimRecapEntries(room.transcripts);

    io.to(roomId).emit("voice-transcript", transcript);
  });

  socket.on("host-control", ({ action, targetSocketId }) => {
    const roomId = socket.data.roomId;
    if (!roomId) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      return;
    }

    if (room.ended) {
      return;
    }

    const hostParticipant = room.participants.get(socket.id);
    if (!hostParticipant?.isHost) {
      socket.emit("error-message", "Only host can use this action.");
      return;
    }

    if (!targetSocketId || !room.participants.has(targetSocketId) || targetSocketId === socket.id) {
      return;
    }

    if (action === "mute-user") {
      io.to(targetSocketId).emit("host-force-mute", { by: socket.data.username });
      return;
    }

    if (action === "remove-user") {
      io.to(targetSocketId).emit("removed-by-host", { by: socket.data.username });
      const target = io.sockets.sockets.get(targetSocketId);
      if (target) {
        target.disconnect(true);
      }
    }
  });

  socket.on("leave-meeting", () => {
    try {
      if (socket.data._personalRecapSent) return;
      const roomId = socket.data.roomId;
      if (!roomId || !rooms.has(roomId)) return;
      const room = rooms.get(roomId);
      const participant = room.participants.get(socket.id);
      if (!participant) return;

      const leftAt = Date.now();
      const recap = buildPersonalRecap(room, participant, leftAt);

      // store per-user history
      const history = listForUser(meetingHistoryByUser, participant.userId);
      history.unshift({ id: crypto.randomUUID(), roomId: room.roomId, title: recap.title, joinedAt: recap.joinedAt, leftAt: recap.leftAt, durationMs: recap.durationMs });
      if (history.length > 50) history.length = 50;
      saveUsersToDisk();

      socket.emit("personal-recap", { recap });
      // send email asynchronously
      if (socket.data?.authUser?.email) {
        sendPersonalRecapEmail(socket.data.authUser.email, recap).catch((e) => console.error("personal recap email error:", e));
      }
      socket.data._personalRecapSent = true;
    } catch (err) {
      console.error("Error generating personal recap on leave-meeting:", err);
    }

    // disconnect after sending recap
    try { socket.disconnect(true); } catch (e) {}
  });

  socket.on("disconnecting", () => {
    try {
      if (socket.data._personalRecapSent) return;
      const roomId = socket.data.roomId;
      if (!roomId || !rooms.has(roomId)) return;
      const room = rooms.get(roomId);
      const participant = room.participants.get(socket.id);
      if (!participant) return;

      const leftAt = Date.now();
      const recap = buildPersonalRecap(room, participant, leftAt);

      const history = listForUser(meetingHistoryByUser, participant.userId);
      history.unshift({ id: crypto.randomUUID(), roomId: room.roomId, title: recap.title, joinedAt: recap.joinedAt, leftAt: recap.leftAt, durationMs: recap.durationMs });
      if (history.length > 50) history.length = 50;
      saveUsersToDisk();

      socket.emit("personal-recap", { recap });
      if (socket.data?.authUser?.email) {
        sendPersonalRecapEmail(socket.data.authUser.email, recap).catch((e) => console.error("personal recap email error:", e));
      }
      socket.data._personalRecapSent = true;
    } catch (err) {
      console.error("Error generating personal recap on disconnecting:", err);
    }
  });

  socket.on("end-meeting", () => {
    const roomId = socket.data.roomId;
    if (!roomId) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room || room.ended) {
      return;
    }

    const hostParticipant = room.participants.get(socket.id);
    if (!hostParticipant?.isHost) {
      socket.emit("error-message", "Only host can end the meeting.");
      return;
    }

    const recap = storeMeetingRecap(room, {
      endedAt: Date.now(),
      endedBy: socket.data.username,
      reason: "host-ended",
    });

    room.pendingRequests.forEach((_, pendingSocketId) => {
      const pendingSocket = io.sockets.sockets.get(pendingSocketId);
      pendingSocket?.emit("join-rejected", { reason: "meeting-ended" });
      if (pendingSocket) {
        pendingSocket.data.pendingRoomId = "";
      }
    });
    room.pendingRequests.clear();

    io.to(roomId).emit("meeting-ended", { recap });
  });

  socket.on("disconnect", () => {
    const pendingRoomId = socket.data.pendingRoomId;
    if (pendingRoomId && rooms.has(pendingRoomId)) {
      const pendingRoom = rooms.get(pendingRoomId);
      pendingRoom.pendingRequests.delete(socket.id);
      emitPendingRequestsToHost(pendingRoom);
    }

    const roomId = socket.data.roomId;
    if (!roomId) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      return;
    }

    const removed = room.participants.get(socket.id);
    room.participants.delete(socket.id);

    if (room.ended) {
      if (room.participants.size === 0) {
        rooms.delete(roomId);
      }
      return;
    }

    if (removed) {
      socket.to(roomId).emit("user-left", {
        socketId: socket.id,
        userId: removed.userId,
        username: removed.username,
      });
    }

    if (room.participants.size === 0) {
      room.pendingRequests.forEach((_, pendingSocketId) => {
        const pendingSocket = io.sockets.sockets.get(pendingSocketId);
        pendingSocket?.emit("join-rejected", { reason: "meeting-ended" });
        if (pendingSocket) {
          pendingSocket.data.pendingRoomId = "";
        }
      });
      storeMeetingRecap(room, {
        endedAt: Date.now(),
        endedBy: removed?.username || socket.data.username || "",
        reason: "room-empty",
      });
      rooms.delete(roomId);
      return;
    }

    if (room.hostSocketId === socket.id) {
      const [nextHostSocketId, nextHostParticipant] = room.participants.entries().next().value;
      room.hostSocketId = nextHostSocketId;
      nextHostParticipant.isHost = true;

      const promotedSocket = io.sockets.sockets.get(nextHostSocketId);
      if (promotedSocket) {
        promotedSocket.data.isHost = true;
        promotedSocket.emit("user-role-updated", { isHost: true });
      }

      emitPendingRequestsToHost(room);
    }

    io.to(roomId).emit("room-meta-updated", roomMeta(room));
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("Speech transcription is browser-only via the Web Speech API.");
});
