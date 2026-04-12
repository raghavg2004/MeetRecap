const meetingTitle = document.getElementById("meetingTitle");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const shareScreenBtn = document.getElementById("shareScreenBtn");
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

let rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

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
        const token = getToken();
        const connectSocket = async () => {
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
          });

          socket.on("user-joined", async ({ socketId, username }) => {
            participants.set(socketId, { username });
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

          socket.on("host-force-mute", ({ by }) => {
            if (!localStream) {
              return;
            }

            micEnabled = false;
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
          });

          socket.on("user-role-updated", ({ isHost }) => {
            setHostMode(isHost);
          });

          socket.on("join-requests-updated", ({ requests }) => {
            pendingJoinRequests = Array.isArray(requests) ? requests : [];
            renderJoinRequests();
          });
        };

        connectSocket();
  // Avoid creating a second overlapping offer while negotiation is already in progress.
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
  // Visual states for icon buttons are handled by patchControlButtons() in meeting.html
  // We only need to keep disabled state in sync
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

function ensureSocketConnected() {
  const token = getToken();
  socket = io({
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
  });

  socket.on("user-joined", async ({ socketId, username }) => {
    participants.set(socketId, { username });
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

  socket.on("host-force-mute", ({ by }) => {
    if (!localStream) {
      return;
    }

    micEnabled = false;
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
  });

  socket.on("user-role-updated", ({ isHost }) => {
    setHostMode(isHost);
  });

  socket.on("join-requests-updated", ({ requests }) => {
    pendingJoinRequests = Array.isArray(requests) ? requests : [];
    renderJoinRequests();
  });
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
  } catch (error) {
    const secureHint = window.isSecureContext
      ? "Please allow camera and microphone permissions, then retry."
      : "Open the app on localhost or HTTPS so browser media permissions work.";
    const message = error instanceof Error ? error.message : "Unable to access camera/microphone.";
    setStatus(`${message} ${secureHint}`);
    return;
  }

  ensureSocketConnected();

  renderChatEmpty();
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

leaveBtn.addEventListener("click", () => {
  leaveMeeting();
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !socket) {
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

window.addEventListener("beforeunload", () => {
  if (screenTrack) {
    screenTrack.stop();
  }
  if (meetingTimerInterval) {
    clearInterval(meetingTimerInterval);
  }
  stopLobbyCountdown();
});

initializeMeeting();
