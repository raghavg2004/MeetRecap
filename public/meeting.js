const meetingTitle = document.getElementById("meetingTitle");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const shareScreenBtn = document.getElementById("shareScreenBtn");
const languageSelector = document.getElementById("languageSelector");
const endMeetingBtn = document.getElementById("endMeetingBtn");
const leaveBtn = document.getElementById("leaveBtn");
const videoGrid = document.getElementById("videoGrid");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const statusText = document.getElementById("statusText");
const lobbyOverlay = document.getElementById("lobbyOverlay");
const lobbyTitle = document.getElementById("lobbyTitle");
const lobbyMessage = document.getElementById("lobbyMessage");
const lobbyCountdown = document.getElementById("lobbyCountdown");
const lobbyRetryBtn = document.getElementById("lobbyRetryBtn");
const lobbyLeaveBtn = document.getElementById("lobbyLeaveBtn");
const hostApprovalPanel = document.getElementById("hostApprovalPanel");
const hostApprovalList = document.getElementById("hostApprovalList");
const hostApprovalCount = document.getElementById("hostApprovalCount");
const meetingRecapOverlay = document.getElementById("meetingRecapOverlay");
const recapTitle = document.getElementById("recapTitle");
const recapSubtitle = document.getElementById("recapSubtitle");
const recapStatusBadge = document.getElementById("recapStatusBadge");
const recapStats = document.getElementById("recapStats");
const recapHighlights = document.getElementById("recapHighlights");
const recapParticipants = document.getElementById("recapParticipants");
const recapTranscript = document.getElementById("recapTranscript");
const recapChat = document.getElementById("recapChat");
const liveTranscriptPanel = document.getElementById("liveTranscriptPanel");
const liveTranscriptFeed = document.getElementById("liveTranscriptFeed");
const liveTranscriptEmpty = document.getElementById("liveTranscriptEmpty");
const viewHighlightsBtn = document.getElementById("viewHighlightsBtn");
const downloadRecapBtn = document.getElementById("downloadRecapBtn");
const closeRecapBtn = document.getElementById("closeRecapBtn");

const peers = new Map();
const participants = new Map();
const pendingCandidates = new Map();
const remoteStreams = new Map();

let socket = null;
let currentUser = null;
let currentRoomId = null;
let currentMeetingTitle = "";
let currentMeetingStartedAt = 0;
let currentMeetingJoinedAt = 0;
let localStream;
let cameraTrack;
let screenTrack;
let micEnabled = true;
let camEnabled = true;
let isScreenSharing = false;
let meetingTimerInterval = null;
const meetingTimer = document.getElementById("meetingTimer");
let hasJoinedRoom = false;
let currentLobbyRetryAt = 0;
let lobbyCountdownInterval = null;
let isHostUser = false;
let pendingJoinRequests = [];
let meetingEnded = false;
let currentMeetingRecap = null;
let currentPersonalRecap = null;
let speechRecognition = null;
let speechRecognitionActive = false;
let speechRecognitionShouldListen = false;
let speechRecognitionSessionId = 0;
let lastTranscriptSentAt = 0;
let lastTranscriptText = "";
let transcriptRetryArmed = false;
let speechRecognitionWatchdogInterval = null;
let speechUnsupportedNotified = false;
let forcedTranscriptLanguage = "";

const HINDI_SPEECH_LANGUAGE = "hi-IN";

if (languageSelector && !languageSelector.value) {
  languageSelector.value = HINDI_SPEECH_LANGUAGE;
}

function getPreferredTranscriptLanguage() {
  return HINDI_SPEECH_LANGUAGE;
}

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function getSpeechRecognitionLanguage() {
  return HINDI_SPEECH_LANGUAGE;
}

function getSpeechLanguageLabel(language) {
  return "हिंदी (Hindi)";
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

function emitSpeechTranscript(text) {
  if (!socket || !currentRoomId || meetingEnded) {
    return;
  }

  const safeText = sanitizeTranscriptText(text);
  if (!safeText) {
    return;
  }

  const now = Date.now();
  if (safeText === lastTranscriptText && now - lastTranscriptSentAt < 1500) {
    return;
  }

  lastTranscriptText = safeText;
  lastTranscriptSentAt = now;

  socket.emit("voice-transcript", {
    text: safeText,
    timestamp: now,
  });
}

let rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

let notificationAudioContext = null;

function getNotificationSetting(key) {
  return localStorage.getItem(key) !== "false";
}

function getNotificationAudioContext() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  if (!notificationAudioContext) {
    notificationAudioContext = new AudioContextCtor();
  }

  return notificationAudioContext;
}

async function unlockNotificationAudio() {
  const audioContext = getNotificationAudioContext();
  if (!audioContext) {
    return;
  }

  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {
      // Ignore resume failures caused by browser policy.
    }
  }
}

function playNotificationBeep(kind) {
  const audioContext = getNotificationAudioContext();
  if (!audioContext) {
    return;
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  const now = audioContext.currentTime;
  const tones = kind === "chat"
    ? [{ frequency: 880, duration: 0.09 }, { frequency: 1046, duration: 0.07 }]
    : [{ frequency: 620, duration: 0.08 }, { frequency: 820, duration: 0.09 }];

  let offset = 0;
  tones.forEach((tone) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = tone.frequency;
    gainNode.gain.setValueAtTime(0.0001, now + offset);
    gainNode.gain.exponentialRampToValueAtTime(0.14, now + offset + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + offset + tone.duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + tone.duration + 0.02);

    offset += tone.duration + 0.03;
  });
}

document.addEventListener("pointerdown", unlockNotificationAudio, { once: true, passive: true });
document.addEventListener("keydown", unlockNotificationAudio, { once: true });

function getToken() {
  return localStorage.getItem("authToken") || "";
}

function setStatus(message, type) {
  statusText.textContent = message || '';
  statusText.style.opacity = message ? '1' : '0';
  statusText.className = 'status ' + (type || 'error');
}

function sanitizeMeetingId(rawId) {
  const id = String(rawId || "").trim().toUpperCase();
  return /^[A-Z0-9-]{4,32}$/.test(id) ? id : "";
}

function sanitizeMeetingTitle(rawTitle) {
  const title = String(rawTitle || "").trim().replace(/\s+/g, " ");
  if (!title || title.length > 60) {
    return "";
  }
  return title.replace(/[<>]/g, "");
}

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function stopLobbyCountdown() {
  if (lobbyCountdownInterval) {
    clearInterval(lobbyCountdownInterval);
    lobbyCountdownInterval = null;
  }
}

function hideLobby() {
  stopLobbyCountdown();
  currentLobbyRetryAt = 0;
  lobbyOverlay?.classList.add("hidden");
  lobbyCountdown?.classList.add("hidden");
  lobbyRetryBtn?.classList.add("hidden");
}

function scheduleLobbyCountdown() {
  stopLobbyCountdown();
  if (!currentLobbyRetryAt || !lobbyCountdown) {
    return;
  }

  lobbyCountdown.classList.remove("hidden");
  lobbyCountdownInterval = setInterval(() => {
    const remaining = currentLobbyRetryAt - Date.now();
    if (remaining <= 0) {
      lobbyCountdown.textContent = "Meeting is opening now...";
      stopLobbyCountdown();
      hasJoinedRoom = false;
      emitJoinRoom();
      return;
    }

    lobbyCountdown.textContent = `Room opens in ${formatCountdown(remaining)}`;
  }, 400);
}

function showLobby({ reason, scheduledFor, by } = {}) {
  if (!lobbyOverlay) {
    return;
  }

  lobbyOverlay.classList.remove("hidden");
  lobbyRetryBtn?.classList.add("hidden");
  lobbyCountdown?.classList.add("hidden");
  stopLobbyCountdown();
  currentLobbyRetryAt = 0;

  if (reason === "scheduled-not-started") {
    const nextAt = Number(scheduledFor);
    currentLobbyRetryAt = Number.isFinite(nextAt) ? nextAt : 0;
    const readable = Number.isFinite(nextAt) ? new Date(nextAt).toLocaleString() : "scheduled time";
    if (lobbyTitle) lobbyTitle.textContent = "Meeting Has Not Started";
    if (lobbyMessage) lobbyMessage.textContent = `This meeting is scheduled for ${readable}. Please wait in the lobby.`;
    scheduleLobbyCountdown();
    return;
  }

  if (reason === "awaiting-host-approval") {
    if (lobbyTitle) lobbyTitle.textContent = "Waiting for Host Approval";
    if (lobbyMessage) lobbyMessage.textContent = "Your request was sent. The host must approve before you can join.";
    return;
  }

  if (reason === "rejected-by-host") {
    if (lobbyTitle) lobbyTitle.textContent = "Request Declined";
    if (lobbyMessage) lobbyMessage.textContent = by ? `${by} rejected your join request.` : "Host rejected your join request.";
    lobbyRetryBtn?.classList.remove("hidden");
    return;
  }

  if (reason === "meeting-ended") {
    if (lobbyTitle) lobbyTitle.textContent = "Meeting Ended";
    if (lobbyMessage) lobbyMessage.textContent = "The host ended this meeting. Please return to dashboard.";
    return;
  }

  if (reason === "meeting-full") {
    if (lobbyTitle) lobbyTitle.textContent = "Meeting Full";
    if (lobbyMessage) lobbyMessage.textContent = "This meeting reached its participant limit.";
    return;
  }

  if (lobbyTitle) lobbyTitle.textContent = "Waiting to Join";
  if (lobbyMessage) lobbyMessage.textContent = "Please wait while we process your request.";
}

function renderJoinRequests() {
  if (!hostApprovalPanel || !hostApprovalList || !hostApprovalCount) {
    return;
  }

  if (!isHostUser || !pendingJoinRequests.length) {
    hostApprovalPanel.classList.add("hidden");
    hostApprovalCount.textContent = "0";
    hostApprovalList.innerHTML = "";
    return;
  }

  hostApprovalPanel.classList.remove("hidden");
  hostApprovalCount.textContent = String(pendingJoinRequests.length);

  hostApprovalList.innerHTML = pendingJoinRequests
    .map((request) => `
      <div class="host-approval-item">
        <strong>${escHtml(request.username)}</strong>
        <p>Wants to join this meeting</p>
        <div class="host-approval-actions">
          <button type="button" class="btn btn-secondary" data-action="reject" data-socket-id="${escHtml(request.socketId)}">
            <i class="bi bi-x-circle"></i> Reject
          </button>
          <button type="button" class="btn btn-brand" data-action="approve" data-socket-id="${escHtml(request.socketId)}">
            <i class="bi bi-check-circle"></i> Approve
          </button>
        </div>
      </div>
    `)
    .join("");
}

function setHostMode(value) {
  isHostUser = Boolean(value);
  if (!isHostUser) {
    pendingJoinRequests = [];
  }
  if (endMeetingBtn) {
    endMeetingBtn.classList.toggle("hidden", !isHostUser || meetingEnded);
  }
  renderJoinRequests();
}

function formatMeetingDuration(startAt) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startAt) / 1000));
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateMeetingTimerDisplay() {
  if (!meetingTimer || !currentMeetingStartedAt) {
    return;
  }

  meetingTimer.textContent = formatMeetingDuration(currentMeetingStartedAt);
}

function applyMeetingMeta(roomMeta) {
  if (roomMeta && Number.isFinite(Number(roomMeta.startedAt))) {
    currentMeetingStartedAt = Number(roomMeta.startedAt);
    window.dispatchEvent(new CustomEvent("meeting-started-at", {
      detail: currentMeetingStartedAt,
    }));
  }

  if (roomMeta && Number.isFinite(Number(roomMeta.participantCount))) {
    const countEl = document.getElementById("participantCount");
    if (countEl) {
      countEl.textContent = String(roomMeta.participantCount);
    }
  }

  updateMeetingTimerDisplay();
}

function formatDurationHuman(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getApiPath(path) {
  return (window.getApiBaseUrl ? window.getApiBaseUrl() : Promise.resolve(""))
    .then((apiBaseUrl) => (apiBaseUrl ? new URL(path, apiBaseUrl).toString() : path));
}

function safeRecapList(items, emptyText) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-state"><div class="empty-icon"><i class="bi bi-journal-text"></i></div><p>${emptyText}</p></div>`;
  }

  return items.join("");
}

function formatRecapTime(value) {
  return escHtml(new Date(value || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
}

function renderMeetingRecap(recap) {
  currentMeetingRecap = recap || null;
  if (!meetingRecapOverlay || !recap) {
    return;
  }

  meetingEnded = true;
  if (endMeetingBtn) {
    endMeetingBtn.classList.add("hidden");
  }

  const participantsList = Array.isArray(recap.participants) ? recap.participants : [];
  const transcripts = Array.isArray(recap.transcripts) ? recap.transcripts : [];
  const chats = Array.isArray(recap.chatMessages) ? recap.chatMessages : [];

  if (recapTitle) recapTitle.textContent = `MOM for ${recap.title || currentMeetingTitle || currentRoomId || "meeting"}`;
  if (recapSubtitle) {
    recapSubtitle.textContent = `Meeting ended at ${new Date(recap.endedAt || Date.now()).toLocaleString()} and was active for ${formatDurationHuman(recap.durationMs)}`;
  }
  if (recapStatusBadge) recapStatusBadge.textContent = `${recap.summary?.transcriptCount || transcripts.length} voice notes`;

  if (recapStats) {
    recapStats.innerHTML = [
      { label: "Duration", value: formatDurationHuman(recap.durationMs) },
      { label: "Participants", value: String(recap.participantCount || participantsList.length) },
      { label: "Voice Notes", value: String(recap.summary?.transcriptCount || transcripts.length) },
      { label: "Chat Messages", value: String(recap.summary?.chatCount || chats.length) },
    ].map((item) => `
      <div class="recap-stat">
        <span>${escHtml(item.label)}</span>
        <strong>${escHtml(item.value)}</strong>
      </div>
    `).join("");
  }

  if (recapParticipants) {
    recapParticipants.innerHTML = safeRecapList(
      participantsList.map((participant) => `
        <div class="recap-item">
          <div>
            <strong>${escHtml(participant.username || "Participant")}</strong>
            <p>${participant.isHost ? "Host" : "Member"}</p>
          </div>
          <span class="badge badge-cyan">${participant.isHost ? "Host" : "Joined"}</span>
        </div>
      `),
      "No participant data was captured.",
    );
  }

  if (recapTranscript) {
    recapTranscript.innerHTML = safeRecapList(
      transcripts.map((entry) => `
        <div class="recap-item recap-log-item">
          <div>
            <strong>${escHtml(entry.username || "Participant")}</strong>
            <p>${escHtml(entry.text || "")}</p>
          </div>
          <span>${formatRecapTime(entry.timestamp)}</span>
        </div>
      `),
      "No voice transcript was captured.",
    );
  }

  if (recapChat) {
    recapChat.innerHTML = safeRecapList(
      chats.map((entry) => `
        <div class="recap-item recap-log-item">
          <div>
            <strong>${escHtml(entry.username || "Participant")}</strong>
            <p>${escHtml(entry.text || "")}</p>
          </div>
          <span>${formatRecapTime(entry.timestamp)}</span>
        </div>
      `),
      "No chat messages were captured.",
    );
  }

  meetingRecapOverlay.classList.remove("hidden");
  recapHighlights?.classList.remove("hidden");
}

function showRecapHighlights() {
  recapHighlights?.classList.toggle("hidden");
}

async function fetchMeetingRecap() {
  if (!currentRoomId) {
    return null;
  }

  try {
    const url = await getApiPath(`/api/meetings/${encodeURIComponent(currentRoomId)}/recap`);
    const response = await fetch(url, {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.recap || null;
  } catch {
    return null;
  }
}

async function downloadMeetingRecapPdf() {
  if (!currentRoomId) {
    return;
  }

  try {
    const isPersonal = Boolean(currentPersonalRecap);
    const path = isPersonal ? `/api/meetings/${encodeURIComponent(currentRoomId)}/personal-recap.pdf` : `/api/meetings/${encodeURIComponent(currentRoomId)}/recap.pdf`;
    const url = await getApiPath(path);
    const response = await fetch(url, {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Unable to generate PDF.");
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `MeetRecap-${currentRoomId}-MOM.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  } catch {
    setStatus("Could not download the MOM PDF.");
  }
}

function stopSpeechRecognition() {
  speechRecognitionShouldListen = false;
  speechRecognitionActive = false;
  transcriptRetryArmed = false;
  stopSpeechRecognitionWatchdog();
  speechRecognitionSessionId += 1;

  if (speechRecognition) {
    const recognition = speechRecognition;
    speechRecognition = null;
    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    } catch {
      // Ignore shutdown errors.
    }
  }

  lastTranscriptText = "";
  lastTranscriptSentAt = 0;
}

function startSpeechRecognitionWatchdog() {
  if (speechRecognitionWatchdogInterval || meetingEnded) {
    return;
  }

  // Browser speech recognition can stop silently; watchdog keeps it alive.
  speechRecognitionWatchdogInterval = setInterval(() => {
    if (meetingEnded || !socket || !socket.connected) {
      return;
    }

    if (!speechRecognitionActive) {
      startSpeechRecognition();
    }
  }, 10000);
}

function stopSpeechRecognitionWatchdog() {
  if (!speechRecognitionWatchdogInterval) {
    return;
  }

  clearInterval(speechRecognitionWatchdogInterval);
  speechRecognitionWatchdogInterval = null;
}

function armTranscriptRetryOnInteraction() {
  if (transcriptRetryArmed || meetingEnded) {
    return;
  }

  transcriptRetryArmed = true;
  const retry = () => {
    transcriptRetryArmed = false;
    startSpeechRecognition();
  };

  // Some browsers require a fresh user gesture to start speech recognition.
  window.addEventListener("pointerdown", retry, { once: true, passive: true });
  window.addEventListener("keydown", retry, { once: true });
}

function startSpeechRecognition() {
  if (speechRecognitionActive || meetingEnded || !micEnabled || !localStream || !currentRoomId) {
    console.log("[STT] startSpeechRecognition guard:", { speechRecognitionActive, meetingEnded, micEnabled, localStream: !!localStream, currentRoomId });
    return;
  }

  const SpeechRecognitionCtor = getSpeechRecognitionCtor();
  if (!SpeechRecognitionCtor) {
    if (!speechUnsupportedNotified) {
      setStatus("Browser speech recognition is not supported here. Use Chrome or Edge.", "info");
      speechUnsupportedNotified = true;
    }
    stopSpeechRecognitionWatchdog();
    return;
  }

  const language = getSpeechRecognitionLanguage();
  const sessionId = ++speechRecognitionSessionId;
  speechRecognitionShouldListen = true;
  speechUnsupportedNotified = false;
  startSpeechRecognitionWatchdog();

  try {
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = language;

    recognition.onresult = (event) => {
      if (sessionId !== speechRecognitionSessionId || !speechRecognitionShouldListen || meetingEnded) {
        return;
      }

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result?.isFinal) {
          continue;
        }

        const transcript = String(result[0]?.transcript || "").trim();
        if (transcript) {
          emitSpeechTranscript(transcript);
        }
      }
    };

    recognition.onerror = (event) => {
      if (sessionId !== speechRecognitionSessionId) {
        return;
      }

      const error = String(event?.error || "");
      if (error === "no-speech" || error === "aborted") {
        return;
      }

      if (error === "not-allowed" || error === "service-not-allowed" || error === "audio-capture") {
        setStatus("Speech recognition was blocked or the microphone is unavailable.", "info");
        stopSpeechRecognition();
        return;
      }

      setStatus(`Speech recognition error: ${error || "unknown"}`, "warning");
    };

    recognition.onend = () => {
      if (sessionId !== speechRecognitionSessionId) {
        return;
      }

      speechRecognitionActive = false;
      speechRecognition = null;

      if (speechRecognitionShouldListen && !meetingEnded && micEnabled) {
        setTimeout(() => startSpeechRecognition(), 300);
      }
    };

    speechRecognition = recognition;
    speechRecognitionActive = true;
    recognition.start();
    setStatus(`Speech recognition active in ${getSpeechLanguageLabel(language)}.`, "success");
  } catch (error) {
    speechRecognitionActive = false;
    speechRecognition = null;
    speechRecognitionShouldListen = false;
    speechRecognitionSessionId += 1;
    console.log("[STT] Failed to start browser speech recognition:", error);
    setStatus("Unable to start browser speech recognition.", "info");
    armTranscriptRetryOnInteraction();
  }
}

function startMeetingTimer() {
  if (meetingTimerInterval) {
    clearInterval(meetingTimerInterval);
  }

  updateMeetingTimerDisplay();
  meetingTimerInterval = setInterval(updateMeetingTimerDisplay, 1000);
}

function applyMirrorPreference() {
  const enabled = localStorage.getItem("mirrorSelfVideo") === "true";
  document.body.classList.toggle("self-video-mirror", enabled);
}

async function apiRequest(path, method = "GET", body = null) {
  const apiBaseUrl = await (window.getApiBaseUrl ? window.getApiBaseUrl() : Promise.resolve(""));
  const url = apiBaseUrl ? new URL(path, apiBaseUrl).toString() : path;
  const token = getToken();
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

async function loadRtcConfig() {
  try {
    const apiBaseUrl = await (window.getApiBaseUrl ? window.getApiBaseUrl() : Promise.resolve(""));
    const configUrl = apiBaseUrl ? new URL("/config", apiBaseUrl).toString() : "/config";
    const response = await fetch(configUrl);
    if (!response.ok) {
      return;
    }

    const config = await response.json();
    if (Array.isArray(config.iceServers) && config.iceServers.length > 0) {
      rtcConfig = { iceServers: config.iceServers };
    }
  } catch {
    // Keep default ICE config.
  }
}

function escHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(ts) {
  const date = new Date(ts || Date.now());
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderChatEmpty() {
  const emptyEl = document.getElementById("chatEmpty");
  if (!chatMessages || !emptyEl) {
    return;
  }

  const hasBubbles = Boolean(chatMessages.querySelector(".chat-bubble"));
  emptyEl.style.display = hasBubbles ? "none" : "";
}

function renderLiveTranscriptEmpty() {
  if (!liveTranscriptFeed || !liveTranscriptEmpty) {
    return;
  }

  const hasEntries = Boolean(liveTranscriptFeed.querySelector(".live-transcript-item"));
  liveTranscriptEmpty.style.display = hasEntries ? "none" : "";
}

function appendLiveTranscript(entry) {
  if (!liveTranscriptPanel || !liveTranscriptFeed || !entry || !entry.text) {
    return;
  }

  const transcriptItem = document.createElement("div");
  transcriptItem.className = "live-transcript-item";
  transcriptItem.innerHTML = `
    <div class="live-transcript-meta">
      <span class="live-transcript-speaker">${escHtml(entry.username || "Participant")}</span>
      <span class="live-transcript-time">${escHtml(formatTime(entry.timestamp))}</span>
    </div>
    <div class="live-transcript-text">${escHtml(entry.text || "")}</div>
  `;

  liveTranscriptFeed.appendChild(transcriptItem);

  const entries = liveTranscriptFeed.querySelectorAll(".live-transcript-item");
  if (entries.length > 80) {
    entries[0].remove();
  }

  liveTranscriptFeed.scrollTop = liveTranscriptFeed.scrollHeight;
  renderLiveTranscriptEmpty();
}

function appendChatMessage(message) {
  if (!chatMessages || !message || !message.text) {
    return;
  }

  const ownMessage = Boolean(socket && message.socketId === socket.id);
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${ownMessage ? "own" : "other"}`;
  bubble.innerHTML = `
    <span class="bubble-name">${escHtml(message.username || "Guest")}</span>
    <p>${escHtml(message.text)}</p>
    <span class="bubble-time">${escHtml(formatTime(message.timestamp))}</span>
  `;

  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  renderChatEmpty();

  if (!ownMessage && getNotificationSetting("meetrecap.soundChat")) {
    playNotificationBeep("chat");
  }
}

function getDisplayName(socketId) {
  if (socket && socketId === socket.id) {
    return "You";
  }

  return participants.get(socketId)?.username || "Participant";
}

function addOrUpdateVideoTile(socketId, stream, name, isLocal = false, isHost = false, isMuted = false) {
  if (!videoGrid || !stream) {
    return;
  }

  const tileId = `video-${socketId}`;
  let tile = document.getElementById(tileId);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "video-tile";
    tile.id = tileId;
    tile.innerHTML = `
      <video ${isLocal ? "muted" : ""} playsinline autoplay></video>
      <div class="video-tile-label">
        <span class="video-tile-name"></span>
        <span class="video-tile-mic"><i class="bi bi-mic-fill"></i></span>
      </div>
      <span class="video-tile-host hidden">HOST</span>
    `;
    videoGrid.appendChild(tile);
  }

  const video = tile.querySelector("video");
  if (video && video.srcObject !== stream) {
    video.srcObject = stream;
  }
  if (video) {
    video.muted = isLocal;
    video.classList.toggle("local-video", isLocal);
  }

  const nameEl = tile.querySelector(".video-tile-name");
  if (nameEl) {
    nameEl.textContent = name || getDisplayName(socketId);
  }

  const micEl = tile.querySelector(".video-tile-mic");
  if (micEl) {
    micEl.classList.toggle("muted", Boolean(isMuted));
    micEl.innerHTML = isMuted ? '<i class="bi bi-mic-mute-fill"></i>' : '<i class="bi bi-mic-fill"></i>';
  }

  const hostEl = tile.querySelector(".video-tile-host");
  if (hostEl) {
    hostEl.classList.toggle("hidden", !isHost);
  }
}

function removeVideoTile(socketId) {
  const tile = document.getElementById(`video-${socketId}`);
  if (!tile) {
    return;
  }

  const video = tile.querySelector("video");
  if (video) {
    video.srcObject = null;
  }
  tile.remove();
}

function removeRemoteStream(socketId) {
  const stream = remoteStreams.get(socketId);
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  remoteStreams.delete(socketId);
}

async function ensureLocalMedia() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Media devices are not supported in this browser.");
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    try {
      const trackInfo = localStream.getTracks().map((t) => ({ kind: t.kind, enabled: t.enabled, label: t.label }));
      console.log('[MEDIA] localStream obtained', trackInfo);
    } catch (e) {
      console.log('[MEDIA] localStream obtained (could not enumerate tracks)', e);
    }
  } catch (err) {
    console.error('[MEDIA] getUserMedia error:', err);
    throw new Error(err && err.message ? `Unable to access media: ${err.message}` : 'Unable to access camera/microphone.');
  }

  [cameraTrack] = localStream.getVideoTracks();
  const [audioTrack] = localStream.getAudioTracks();

  const defaultMicOn = true;
  const defaultCamOn = localStorage.getItem("meetrecap.defaultCamOn") !== "false";

  if (audioTrack) {
    audioTrack.enabled = defaultMicOn;
  }
  else {
    console.warn('[MEDIA] No audio track available on localStream');
    setStatus('No microphone detected or access denied.', 'warning');
  }

  if (cameraTrack) {
    cameraTrack.enabled = defaultCamOn;
  }

  micEnabled = audioTrack ? audioTrack.enabled : false;
  camEnabled = cameraTrack ? cameraTrack.enabled : false;

  addOrUpdateVideoTile(
    "local",
    localStream,
    currentUser?.displayName || "You",
    true,
    false,
    !micEnabled,
  );
}

async function flushPendingCandidates(from, pc) {
  const buffered = pendingCandidates.get(from);
  if (!buffered || !buffered.length) {
    return;
  }

  pendingCandidates.delete(from);
  for (const candidate of buffered) {
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      // Ignore stale candidate.
    }
  }
}

async function createPeerConnection(remoteSocketId) {
  if (peers.has(remoteSocketId)) {
    return peers.get(remoteSocketId);
  }

  const pc = new RTCPeerConnection(rtcConfig);
  peers.set(remoteSocketId, pc);

  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }

  pc.onicecandidate = (event) => {
    if (!event.candidate || !socket) {
      return;
    }
    socket.emit("ice-candidate", {
      to: remoteSocketId,
      candidate: event.candidate,
    });
  };

  pc.ontrack = (event) => {
    const [incomingStream] = event.streams;
    if (!incomingStream) {
      return;
    }

    remoteStreams.set(remoteSocketId, incomingStream);
    addOrUpdateVideoTile(remoteSocketId, incomingStream, getDisplayName(remoteSocketId));
  };

  pc.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
      peers.delete(remoteSocketId);
      removeRemoteStream(remoteSocketId);
      removeVideoTile(remoteSocketId);
    }
  };

  return pc;
}

async function callUser(remoteSocketId) {
  if (!socket || !remoteSocketId) {
    return;
  }

  const pc = await createPeerConnection(remoteSocketId);
  if (pc.signalingState !== "stable") {
    return;
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("offer", {
    to: remoteSocketId,
    description: pc.localDescription,
  });
}

async function replaceVideoTrackAcrossPeers(newTrack) {
  const updates = [];
  peers.forEach((pc) => {
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
    if (sender) {
      updates.push(sender.replaceTrack(newTrack));
    }
  });

  await Promise.all(updates);
}

function updateMediaButtons() {
  // Sync mic button visual state with actual micEnabled state
  const micIcon = toggleMicBtn.querySelector('i');
  const micTooltip = toggleMicBtn.querySelector('.ctrl-tooltip');
  
  if (micEnabled) {
    toggleMicBtn.classList.remove('off');
    if (micIcon) micIcon.className = 'bi bi-mic-fill';
    if (micTooltip) micTooltip.textContent = 'Mute Mic';
  } else {
    toggleMicBtn.classList.add('off');
    if (micIcon) micIcon.className = 'bi bi-mic-mute-fill';
    if (micTooltip) micTooltip.textContent = 'Unmute Mic';
  }

  // Camera button disabled state when screen sharing
  if (!isScreenSharing) {
    toggleCamBtn.disabled = false;
  }
}

async function stopScreenShare() {
  if (!isScreenSharing || !screenTrack) {
    return;
  }

  await replaceVideoTrackAcrossPeers(cameraTrack);
  localStream.removeTrack(screenTrack);
  localStream.addTrack(cameraTrack);
  screenTrack.stop();
  screenTrack = null;
  isScreenSharing = false;
  toggleCamBtn.disabled = false;
  updateMediaButtons();
}

async function startScreenShare() {
  if (isScreenSharing) {
    await stopScreenShare();
    return;
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  [screenTrack] = stream.getVideoTracks();
  screenTrack.onended = () => {
    stopScreenShare();
  };

  await replaceVideoTrackAcrossPeers(screenTrack);
  localStream.removeTrack(cameraTrack);
  localStream.addTrack(screenTrack);
  isScreenSharing = true;
  toggleCamBtn.disabled = true;
  updateMediaButtons();
}

function emitJoinRoom() {
  if (!socket || !currentRoomId || !currentUser || hasJoinedRoom) {
    return;
  }

  socket.emit("join-room", {
    roomId: currentRoomId,
    username: currentUser.displayName,
  });
  hasJoinedRoom = true;
}

async function ensureSocketConnected() {
  const token = getToken();
  const socketUrl = await (window.getSocketUrl ? window.getSocketUrl() : Promise.resolve(""));
  socket = socketUrl
    ? io(socketUrl, {
        autoConnect: true,
        auth: { token },
      })
    : io({
        autoConnect: true,
        auth: { token },
      });

  socket.on("connect", () => {
    hasJoinedRoom = false;
    emitJoinRoom();
  });

  socket.on("connect_error", (error) => {
    setStatus(error.message || "Socket connection failed.");
  });

  socket.on('existing-users', async ({ users, roomMeta }) => {
    hideLobby();
    applyMeetingMeta(roomMeta);
    if (!currentMeetingJoinedAt) {
      currentMeetingJoinedAt = Date.now();
    }

    const iAmHost = roomMeta && roomMeta.hostSocketId === socket.id;
    setHostMode(iAmHost);
    startMeetingTimer();

    if (!roomMeta || !Number.isFinite(Number(roomMeta.participantCount))) {
      const countEl = document.getElementById('participantCount');
      if (countEl) countEl.textContent = String(users.length + 1);
    }

    for (const user of users) {
      participants.set(user.socketId, { username: user.username });
      try {
        await callUser(user.socketId);
      } catch {
        // Collision or transient SDP failures are handled by incoming offer flow.
      }
    }

    setTimeout(() => startSpeechRecognition(), 300);
  });

  socket.on("user-joined", async ({ socketId, username }) => {
    participants.set(socketId, { username });

    if (socketId !== socket.id && getNotificationSetting("meetrecap.soundJoinLeave")) {
      playNotificationBeep("join");
    }
  });

  socket.on("offer", async ({ from, description }) => {
    const pc = await createPeerConnection(from);

    if (pc.signalingState !== "stable") {
      try {
        await pc.setLocalDescription({ type: "rollback" });
      } catch {
        // If rollback is unsupported, continue and let setRemoteDescription throw.
      }
    }

    await pc.setRemoteDescription(description);
    await flushPendingCandidates(from, pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer", {
      to: from,
      description: pc.localDescription,
    });
  });

  socket.on("answer", async ({ from, description }) => {
    const pc = peers.get(from);
    if (!pc) {
      return;
    }

    if (pc.signalingState !== "have-local-offer") {
      return;
    }

    try {
      await pc.setRemoteDescription(description);
      await flushPendingCandidates(from, pc);
    } catch {
      setStatus("Reconnecting media stream...", "warning");
    }
  });

  socket.on("ice-candidate", async ({ from, candidate }) => {
    const pc = peers.get(from);
    if (!pc || !pc.remoteDescription) {
      const buffered = pendingCandidates.get(from) || [];
      buffered.push(candidate);
      pendingCandidates.set(from, buffered);
      return;
    }

    try {
      await pc.addIceCandidate(candidate);
    } catch {
      const buffered = pendingCandidates.get(from) || [];
      buffered.push(candidate);
      pendingCandidates.set(from, buffered);
    }
  });

  socket.on("chat-message", (message) => {
    appendChatMessage(message);
  });

  socket.on("voice-transcript", (entry) => {
    appendLiveTranscript(entry);
  });

  socket.on("host-force-mute", ({ by }) => {
    if (!localStream) {
      return;
    }

    micEnabled = false;
    stopSpeechRecognition();
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    updateMediaButtons();
    setStatus(`Muted by host ${by}.`);
  });

  socket.on("removed-by-host", ({ by }) => {
    setStatus(`Removed by host ${by}.`);
    leaveMeeting();
  });

  socket.on("user-left", ({ socketId, username }) => {
    const pc = peers.get(socketId);
    if (pc) {
      pc.close();
    }

    peers.delete(socketId);
    participants.delete(socketId);
    removeRemoteStream(socketId);
    removeVideoTile(socketId);

    if (socketId !== socket.id && getNotificationSetting("meetrecap.soundJoinLeave")) {
      playNotificationBeep("leave");
    }

    appendChatMessage({
      username: "System",
      text: `${username} left the meeting.`,
      timestamp: Date.now(),
    });
  });

  socket.on("error-message", (message) => {
    setStatus(message);
  });

  socket.on("room-meta-updated", (roomMeta) => {
    applyMeetingMeta(roomMeta);
    if (roomMeta && roomMeta.hostSocketId && socket) {
      setHostMode(roomMeta.hostSocketId === socket.id);
    }
  });

  socket.on("lobby-wait", (payload) => {
    hasJoinedRoom = false;
    showLobby(payload || {});
  });

  socket.on("join-rejected", (payload) => {
    hasJoinedRoom = false;
    showLobby(payload || { reason: "rejected-by-host" });
  });

  socket.on("join-approved", () => {
    hideLobby();
    hasJoinedRoom = false;
    setStatus("Host approved your request.", "success");
    startSpeechRecognition();
  });

  socket.on("user-role-updated", ({ isHost }) => {
    setHostMode(isHost);
  });

  socket.on("join-requests-updated", ({ requests }) => {
    pendingJoinRequests = Array.isArray(requests) ? requests : [];
    renderJoinRequests();
  });

  socket.on("meeting-ended", async ({ recap }) => {
    meetingEnded = true;
    stopSpeechRecognition();
    hideLobby();
    hasJoinedRoom = true;
    setStatus("The meeting has ended.", "info");

    const latestRecap = recap || await fetchMeetingRecap();
    if (latestRecap) {
      renderMeetingRecap(latestRecap);
    }

    chatInput.disabled = true;
    chatForm.querySelector("button[type='submit']")?.setAttribute("disabled", "disabled");
    toggleMicBtn.disabled = true;
    toggleCamBtn.disabled = true;
    shareScreenBtn.disabled = true;
    leaveBtn.classList.add("hidden");
    endMeetingBtn?.classList.add("hidden");
  });

  socket.on("personal-recap", ({ recap }) => {
    try {
      currentPersonalRecap = recap || null;
      renderPersonalRecap(currentPersonalRecap);
    } catch (err) {
      console.error("Failed to render personal recap:", err);
    }
  });
}

function renderPersonalRecap(recap) {
  if (!recap || !meetingRecapOverlay) return;
  meetingEnded = true;
  currentMeetingRecap = recap;
  if (endMeetingBtn) endMeetingBtn.classList.add("hidden");

  if (recapTitle) recapTitle.textContent = `Your MOM for ${recap.title || currentMeetingTitle || currentRoomId}`;
  if (recapSubtitle) recapSubtitle.textContent = `Left at ${new Date(recap.leftAt || Date.now()).toLocaleString()} • Duration ${formatDurationHuman(recap.durationMs)}`;

  if (recapStats) {
    recapStats.innerHTML = [`
      <div class="recap-stat"><span>Duration</span><strong>${escHtml(formatDurationHuman(recap.durationMs))}</strong></div>
      <div class="recap-stat"><span>Transcripts</span><strong>${escHtml(String(recap.summary?.transcriptCount || (recap.transcripts||[]).length))}</strong></div>
      <div class="recap-stat"><span>Messages</span><strong>${escHtml(String(recap.summary?.chatCount || (recap.chatMessages||[]).length))}</strong></div>
    `].join("");
  }

  if (recapParticipants) {
    recapParticipants.innerHTML = `<div class="recap-item"><div><strong>${escHtml(recap.participant?.username || 'You')}</strong><p>${recap.participant?.isHost ? 'Host' : 'Member'}</p></div></div>`;
  }

  if (recapTranscript) {
    recapTranscript.innerHTML = safeRecapList((recap.transcripts || []).map((t) => `
      <div class="recap-item recap-log-item"><div><strong>${escHtml(t.username || '')}</strong><p>${escHtml(t.text || '')}</p></div><span>${formatRecapTime(t.timestamp)}</span></div>
    `), 'No voice transcript was captured.');
  }

  if (recapChat) {
    recapChat.innerHTML = safeRecapList((recap.chatMessages || []).map((m) => `
      <div class="recap-item recap-log-item"><div><strong>${escHtml(m.username || '')}</strong><p>${escHtml(m.text || '')}</p></div><span>${formatRecapTime(m.timestamp)}</span></div>
    `), 'No chat messages were captured.');
  }

  meetingRecapOverlay.classList.remove("hidden");
  recapHighlights?.classList.remove("hidden");
}

async function recordMeetingHistory() {
  if (!currentRoomId || !currentMeetingJoinedAt) {
    return;
  }

  try {
    await apiRequest("/api/meetings/history", "POST", {
      roomId: currentRoomId,
      title: currentMeetingTitle || `Meeting ${currentRoomId}`,
      joinedAt: currentMeetingJoinedAt,
      leftAt: Date.now(),
    });
  } catch {
    // Ignore history error.
  }
}

async function leaveMeeting() {
  await recordMeetingHistory();
  hasJoinedRoom = false;
  meetingEnded = true;
  stopSpeechRecognition();
  stopLobbyCountdown();
  currentLobbyRetryAt = 0;

  peers.forEach((pc) => pc.close());
  peers.clear();
  participants.clear();
  pendingCandidates.clear();
  remoteStreams.clear();

  if (screenTrack) {
    screenTrack.stop();
    screenTrack = null;
  }

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  if (socket) {
    socket.disconnect();
  }

  if (meetingTimerInterval) {
    clearInterval(meetingTimerInterval);
    meetingTimerInterval = null;
  }

  window.location.replace("/dashboard");
}

async function endMeetingForEveryone() {
  if (!socket || !isHostUser || meetingEnded) {
    return;
  }

  socket.emit("end-meeting");
}

async function initializeMeeting() {
  const token = getToken();
  if (!token) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/login?next=${next}`);
    return;
  }

  try {
    const me = await apiRequest("/api/auth/me");
    currentUser = me.user;
  } catch {
    localStorage.removeItem("authToken");
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/login?next=${next}`);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const roomId = sanitizeMeetingId(params.get("meeting") || "");
  const requestedTitle = sanitizeMeetingTitle(params.get("title") || "");
  if (!roomId) {
    window.location.replace("/dashboard");
    return;
  }

  currentRoomId = roomId;
  currentMeetingTitle = requestedTitle || `Meeting ${roomId}`;
  currentMeetingJoinedAt = 0;
  if (meetingTitle) meetingTitle.textContent = currentMeetingTitle;

  applyMirrorPreference();
  await loadRtcConfig();
  try {
    await ensureLocalMedia();
    updateMediaButtons();
  } catch (error) {
    const secureHint = window.isSecureContext
      ? "Please allow camera and microphone permissions, then retry."
      : "Open the app on localhost or HTTPS so browser media permissions work.";
    const message = error instanceof Error ? error.message : "Unable to access camera/microphone.";
    setStatus(`${message} ${secureHint}`);
    return;
  }

  await unlockNotificationAudio();

  await ensureSocketConnected();

  renderChatEmpty();
  renderLiveTranscriptEmpty();
  updateMediaButtons();
}

copyLinkBtn.addEventListener('click', async () => {
  if (!currentRoomId) return;
  try {
    const link = `${window.location.origin}/meeting?meeting=${encodeURIComponent(currentRoomId)}`;
    await navigator.clipboard.writeText(link);
    // Toast is handled in meeting.html via its own copyLinkBtn listener
  } catch {
    setStatus('Clipboard permission denied.');
  }
});

toggleMicBtn.addEventListener("click", () => {
  if (!localStream) {
    return;
  }

  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = micEnabled;
  });

  if (micEnabled && !meetingEnded) {
    startSpeechRecognition();
  } else {
    stopSpeechRecognition();
  }

  updateMediaButtons();
});

toggleCamBtn.addEventListener("click", () => {
  if (!cameraTrack || isScreenSharing) {
    return;
  }

  camEnabled = !camEnabled;
  cameraTrack.enabled = camEnabled;
  updateMediaButtons();
});

shareScreenBtn.addEventListener("click", async () => {
  if (!localStream || !cameraTrack) {
    return;
  }

  try {
    await startScreenShare();
  } catch {
    setStatus("Unable to start screen share.");
  }
});

if (languageSelector) {
  languageSelector.value = HINDI_SPEECH_LANGUAGE;
}

leaveBtn.addEventListener("click", () => {
  leaveMeeting();
});

endMeetingBtn?.addEventListener("click", () => {
  endMeetingForEveryone();
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !socket || meetingEnded) {
    return;
  }

  socket.emit("chat-message", { text });
  chatInput.value = "";
});

hostApprovalList?.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-action][data-socket-id]");
  if (!target || !socket || !isHostUser) {
    return;
  }

  socket.emit("host-lobby-decision", {
    action: target.dataset.action,
    targetSocketId: target.dataset.socketId,
  });
});

lobbyRetryBtn?.addEventListener("click", () => {
  hasJoinedRoom = false;
  emitJoinRoom();
});

lobbyLeaveBtn?.addEventListener("click", () => {
  leaveMeeting();
});

viewHighlightsBtn?.addEventListener("click", showRecapHighlights);

downloadRecapBtn?.addEventListener("click", () => {
  downloadMeetingRecapPdf();
});

closeRecapBtn?.addEventListener("click", () => {
  leaveMeeting();
});

window.addEventListener("beforeunload", () => {
  if (screenTrack) {
    screenTrack.stop();
  }
  if (meetingTimerInterval) {
    clearInterval(meetingTimerInterval);
  }
  stopSpeechRecognition();
  stopLobbyCountdown();
});

initializeMeeting();
