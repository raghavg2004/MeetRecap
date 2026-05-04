/* ── Dashboard JS ────────────────────────────────────────── */

/* ── DOM References ──────────────────────────────────────── */
const welcomeText = document.getElementById('welcomeText');
const userNameLabel = document.getElementById('userNameLabel');
const userAvatar = document.getElementById('userAvatar');
const logoutBtn = document.getElementById('logoutBtn');
const createMeetingBtn = document.getElementById('createMeetingBtn');
const createMeetingBtnOv = document.getElementById('createMeetingBtnOverview');
const joinMeetingBtn = document.getElementById('joinMeetingBtn');
const meetingIdInput = document.getElementById('meetingIdInput');
const scheduleForm = document.getElementById('scheduleForm');
const scheduleTitle = document.getElementById('scheduleTitle');
const scheduleDateTime = document.getElementById('scheduleDateTime');
const scheduleSubmitBtn = document.getElementById('scheduleSubmitBtn');
const scheduleStatusText = document.getElementById('scheduleStatusText');
const scheduledList = document.getElementById('scheduledList');
const overviewScheduledList = document.getElementById('overviewScheduledList');
const historyList = document.getElementById('historyList');
const recapHistoryList = document.getElementById('recapHistoryList');
const recapPreview = document.getElementById('recapPreview');
const statusText = document.getElementById('statusText');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebar = document.getElementById('sidebar');
const mobileBackdrop = document.getElementById('mobileSidebarBackdrop');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-link[data-section]');

const meetingTitleDialog = document.getElementById('meetingTitleDialog');
const meetingTitleDialogInput = document.getElementById('meetingTitleDialogInput');
const meetingTitleDialogStatus = document.getElementById('meetingTitleDialogStatus');
const meetingTitleDialogCancel = document.getElementById('meetingTitleDialogCancel');
const meetingTitleDialogConfirm = document.getElementById('meetingTitleDialogConfirm');

const settingsStatusText = document.getElementById('settingsStatusText');
const displayNameInput = document.getElementById('displayNameInput');
const avatarUploadInput = document.getElementById('avatarUploadInput');
const clearAvatarBtn = document.getElementById('clearAvatarBtn');
const mirrorToggle = document.getElementById('mirrorToggle');
const defaultMicToggle = document.getElementById('defaultMicToggle');
const defaultCamToggle = document.getElementById('defaultCamToggle');
const notifyJoinLeaveToggle = document.getElementById('notifyJoinLeaveToggle');
const notifyChatToggle = document.getElementById('notifyChatToggle');
const desktopRemindersToggle = document.getElementById('desktopRemindersToggle');
const reminderTimingButtons = document.querySelectorAll('#reminderTimingButtons .seg-btn');
const themePresetButtons = document.querySelectorAll('#themePresetButtons .seg-btn');

const changePasswordBtn = document.getElementById('changePasswordBtn');
const aboutBtn = document.getElementById('aboutBtn');
const privacyBtn = document.getElementById('privacyBtn');
const termsBtn = document.getElementById('termsBtn');
const faqBtn = document.getElementById('faqBtn');
const askQuestionBtn = document.getElementById('askQuestionBtn');

const settingsInfoDialog = document.getElementById('settingsInfoDialog');
const settingsInfoDialogHeading = document.getElementById('settingsInfoDialogHeading');
const settingsInfoDialogDescription = document.getElementById('settingsInfoDialogDescription');
const settingsInfoDialogBody = document.getElementById('settingsInfoDialogBody');
const settingsInfoDialogClose = document.getElementById('settingsInfoDialogClose');

const changePasswordDialog = document.getElementById('changePasswordDialog');
const newPasswordInput = document.getElementById('newPasswordInput');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');
const changePasswordStatus = document.getElementById('changePasswordStatus');
const changePasswordCancel = document.getElementById('changePasswordCancel');
const changePasswordConfirm = document.getElementById('changePasswordConfirm');

const askQuestionDialog = document.getElementById('askQuestionDialog');
const askQuestionInput = document.getElementById('askQuestionInput');
const askQuestionStatus = document.getElementById('askQuestionStatus');
const askQuestionCancel = document.getElementById('askQuestionCancel');
const askQuestionSend = document.getElementById('askQuestionSend');

/* Stats */
const statTotal = document.getElementById('statTotal');
const statScheduled = document.getElementById('statScheduled');
const statDuration = document.getElementById('statDuration');

/* ── Local Settings ──────────────────────────────────────── */
const SETTINGS_KEY = 'meetrecap.settings.v1';
const settingsDefaults = {
  displayNameOverride: '',
  avatarDataUrl: '',
  defaultMicOn: true,
  defaultCamOn: true,
  soundJoinLeave: true,
  soundChat: true,
  desktopReminders: false,
  reminderMinutes: 10,
  themePreset: 'dark',
};

let appSettings = { ...settingsDefaults };
let currentServerDisplayName = '';
let reminderTimeoutIds = [];
let meetingTitleResolver = null;
let selectedRecapRoomId = '';
let recapHistoryLookup = new Map();
let currentRecapHistory = [];

/* ── Helpers ─────────────────────────────────────────────── */
function getToken() { return localStorage.getItem('authToken') || ''; }
function clearToken() { localStorage.removeItem('authToken'); }

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    appSettings = { ...settingsDefaults, ...parsed };
  } catch {
    appSettings = { ...settingsDefaults };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
  localStorage.setItem('mirrorSelfVideo', String(Boolean(mirrorToggle?.checked)));
  localStorage.setItem('meetrecap.defaultMicOn', String(Boolean(appSettings.defaultMicOn)));
  localStorage.setItem('meetrecap.defaultCamOn', String(Boolean(appSettings.defaultCamOn)));
  localStorage.setItem('meetrecap.soundJoinLeave', String(Boolean(appSettings.soundJoinLeave)));
  localStorage.setItem('meetrecap.soundChat', String(Boolean(appSettings.soundChat)));
}

function setStatus(msg, type = 'error') {
  if (!statusText) return;
  statusText.textContent = msg || '';
  statusText.className = 'status ' + (msg ? type : '');
}

function setScopedStatus(targetEl, msg, type = 'error') {
  if (!targetEl) return;
  targetEl.textContent = msg || '';
  targetEl.className = 'status ' + (msg ? type : '');
}

function sanitizeMeetingId(rawId) {
  const id = String(rawId || '').trim().toUpperCase();
  return /^[A-Z0-9-]{4,32}$/.test(id) ? id : '';
}

function sanitizeMeetingTitle(rawTitle) {
  const title = String(rawTitle || '').trim().replace(/\s+/g, ' ');
  if (!title || title.length > 60) return '';
  return title.replace(/[<>]/g, '');
}

function sanitizeDisplayName(rawName) {
  const value = String(rawName || '').trim().replace(/\s+/g, ' ');
  if (!value || value.length > 24) return '';
  return value.replace(/[<>]/g, '');
}

function makeMeetingId() {
  const l = Math.random().toString(36).slice(2, 6).toUpperCase();
  const n = Math.random().toString(10).slice(2, 6);
  return `${l}-${n}`;
}

function fmtDate(ms) {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtDuration(ms) {
  const mins = Math.max(1, Math.round(ms / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function initials(name) {
  return (name || 'U').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function setLoading(btn, loading) {
  if (!btn) return;
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getEffectiveTheme() {
  if (appSettings.themePreset === 'light') return 'light';
  if (appSettings.themePreset === 'dark') return 'dark';
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

function applyThemePreference() {
  const theme = getEffectiveTheme();
  document.body.classList.toggle('theme-light', theme === 'light');
  updateSegmentedButtons(themePresetButtons, appSettings.themePreset || 'dark');
}

function updateSegmentedButtons(buttons, selectedValue) {
  buttons.forEach((btn) => {
    const active = btn.dataset.value === String(selectedValue);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function applyIdentityUI() {
  const displayName = appSettings.displayNameOverride || currentServerDisplayName || 'there';
  if (welcomeText) welcomeText.textContent = displayName;
  if (userNameLabel) userNameLabel.textContent = displayName;

  if (!userAvatar) return;
  if (appSettings.avatarDataUrl) {
    userAvatar.textContent = '';
    userAvatar.style.backgroundImage = `url(${appSettings.avatarDataUrl})`;
    userAvatar.style.backgroundSize = 'cover';
    userAvatar.style.backgroundPosition = 'center';
  } else {
    userAvatar.style.backgroundImage = '';
    userAvatar.textContent = initials(displayName);
  }
}

function applySettingsControls() {
  if (displayNameInput) displayNameInput.value = appSettings.displayNameOverride || '';
  if (mirrorToggle) mirrorToggle.checked = localStorage.getItem('mirrorSelfVideo') === 'true';
  if (defaultMicToggle) defaultMicToggle.checked = Boolean(appSettings.defaultMicOn);
  if (defaultCamToggle) defaultCamToggle.checked = Boolean(appSettings.defaultCamOn);
  if (notifyJoinLeaveToggle) notifyJoinLeaveToggle.checked = Boolean(appSettings.soundJoinLeave);
  if (notifyChatToggle) notifyChatToggle.checked = Boolean(appSettings.soundChat);
  if (desktopRemindersToggle) desktopRemindersToggle.checked = Boolean(appSettings.desktopReminders);
  updateSegmentedButtons(reminderTimingButtons, String(appSettings.reminderMinutes || 10));
  updateSegmentedButtons(themePresetButtons, appSettings.themePreset || 'dark');
}

function clearReminderTimers() {
  reminderTimeoutIds.forEach((id) => clearTimeout(id));
  reminderTimeoutIds = [];
}

function scheduleMeetingReminders(meetings) {
  clearReminderTimers();
  if (!appSettings.desktopReminders) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const beforeMs = Number(appSettings.reminderMinutes || 10) * 60 * 1000;
  meetings.forEach((meeting) => {
    const triggerAt = Number(meeting.scheduledFor) - beforeMs;
    const delay = triggerAt - Date.now();
    if (!Number.isFinite(delay) || delay <= 0 || delay > 24 * 60 * 60 * 1000) {
      return;
    }

    const timeoutId = setTimeout(() => {
      try {
        new Notification('MeetRecap Reminder', {
          body: `${meeting.title} starts in ${appSettings.reminderMinutes} minutes.`,
        });
      } catch {
        // Ignore notification errors.
      }
    }, delay);
    reminderTimeoutIds.push(timeoutId);
  });
}

function openDialog(dialogEl) {
  if (!dialogEl) return;
  dialogEl.classList.remove('hidden');
  document.body.classList.add('dialog-open');
}

function closeDialog(dialogEl) {
  if (!dialogEl) return;
  dialogEl.classList.add('hidden');
  if (meetingTitleDialog?.classList.contains('hidden') && settingsInfoDialog?.classList.contains('hidden') && changePasswordDialog?.classList.contains('hidden') && askQuestionDialog?.classList.contains('hidden')) {
    document.body.classList.remove('dialog-open');
  }
}

function openInfoDialog(title, description, bodyHtml) {
  if (!settingsInfoDialogHeading || !settingsInfoDialogDescription || !settingsInfoDialogBody) return;
  settingsInfoDialogHeading.textContent = title;
  settingsInfoDialogDescription.textContent = description;
  settingsInfoDialogBody.innerHTML = bodyHtml;
  openDialog(settingsInfoDialog);
}

/* ── API ─────────────────────────────────────────────────── */
async function apiRequest(path, method = 'GET', body = null) {
  const apiBaseUrl = await (window.getApiBaseUrl ? window.getApiBaseUrl() : Promise.resolve(''));
  const url = apiBaseUrl ? new URL(path, apiBaseUrl).toString() : path;
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

/* ── Sidebar Navigation ──────────────────────────────────── */
const sidebarLinks = document.querySelectorAll('.sidebar-link[data-section]');
const sections = document.querySelectorAll('.dash-section');

function showSection(name) {
  sections.forEach((s) => s.classList.remove('active'));
  sidebarLinks.forEach((l) => l.classList.remove('active'));
  mobileNavLinks.forEach((l) => l.classList.remove('active'));

  const targetSection = document.getElementById(`section-${name}`);
  if (targetSection) targetSection.classList.add('active');

  const targetLink = document.querySelector(`.sidebar-link[data-section="${name}"]`);
  if (targetLink) targetLink.classList.add('active');

  const targetMobileLink = document.querySelector(`.mobile-nav-link[data-section="${name}"]`);
  if (targetMobileLink) targetMobileLink.classList.add('active');

  closeMobileSidebar();
}

function openMobileSidebar() {
  if (!sidebar) return;
  sidebar.classList.add('mobile-open');
  document.body.classList.add('mobile-nav-open');
}

function closeMobileSidebar() {
  if (!sidebar) return;
  sidebar.classList.remove('mobile-open');
  document.body.classList.remove('mobile-nav-open');
}

sidebarLinks.forEach((link) => {
  link.addEventListener('click', () => showSection(link.dataset.section));
});

mobileNavLinks.forEach((link) => {
  link.addEventListener('click', () => showSection(link.dataset.section));
});

mobileMenuBtn?.addEventListener('click', () => {
  if (sidebar?.classList.contains('mobile-open')) {
    closeMobileSidebar();
    return;
  }
  openMobileSidebar();
});

mobileBackdrop?.addEventListener('click', closeMobileSidebar);

window.addEventListener('resize', () => {
  if (window.innerWidth > 768) closeMobileSidebar();
});

document.querySelectorAll('[data-section]').forEach((el) => {
  if (el.tagName === 'BUTTON' && !el.classList.contains('sidebar-link') && !el.classList.contains('mobile-nav-link')) {
    el.addEventListener('click', () => {
      const sec = el.dataset.section;
      if (sec) showSection(sec);
    });
  }
});

/* ── Render Helpers ──────────────────────────────────────── */
function emptyState(icon, msg) {
  return `
    <div class="empty-state">
      <div class="empty-icon"><i class="bi ${icon}"></i></div>
      <p>${msg}</p>
    </div>
  `;
}

function renderScheduledMeetings(items, container) {
  if (!container) return;
  if (!items || !items.length) {
    container.innerHTML = emptyState('bi-calendar-x', 'No upcoming meetings scheduled.');
    return;
  }
  container.innerHTML = items.map((m) => `
    <div class="meeting-row">
      <div class="meeting-row-left">
        <div class="meeting-row-icon"><i class="bi bi-calendar-event"></i></div>
        <div class="meeting-row-info">
          <strong>${escHtml(m.title)}</strong>
          <span><i class="bi bi-clock"></i> ${fmtDate(m.scheduledFor)}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="badge badge-violet"><i class="bi bi-hash"></i> ${escHtml(m.roomId)}</span>
        <button class="btn btn-secondary" style="font-size:0.78rem;padding:5px 10px;" onclick="copyMeetingInvite('${escHtml(m.roomId)}')">
          <i class="bi bi-share"></i> Share
        </button>
        <button class="btn btn-secondary" style="font-size:0.78rem;padding:5px 10px;" onclick="redirectToMeeting('${escHtml(m.roomId)}')">
          <i class="bi bi-box-arrow-in-right"></i> Join
        </button>
      </div>
    </div>
  `).join('');
}

function renderMeetingHistory(items) {
  if (!historyList) return;
  if (!items || !items.length) {
    historyList.innerHTML = emptyState('bi-clock-history', 'No meeting history yet. Start your first meeting!');
    return;
  }
  historyList.innerHTML = items.map((m) => `
    <div class="meeting-row">
      <div class="meeting-row-left">
        <div class="meeting-row-icon" style="background:rgba(6,182,212,0.12);color:var(--cyan);">
          <i class="bi bi-camera-video"></i>
        </div>
        <div class="meeting-row-info">
          <strong>${escHtml(m.title)}</strong>
          <span>${fmtDate(m.joinedAt)} &nbsp;·&nbsp; <i class="bi bi-clock"></i> ${fmtDuration(m.durationMs)}</span>
        </div>
      </div>
      <span class="badge badge-cyan"><i class="bi bi-hash"></i> ${escHtml(m.roomId)}</span>
    </div>
  `).join('');
}

function renderRecapPreview(recap) {
  if (!recapPreview) return;

  if (!recap) {
    recapPreview.innerHTML = `
      <div class="empty-state" style="margin-top:12px;">
        <div class="empty-icon"><i class="bi bi-file-earmark-text"></i></div>
        <p>Select a recap to view MOM highlights.</p>
      </div>
    `;
    return;
  }

  const transcripts = Array.isArray(recap.transcripts) ? recap.transcripts : [];
  const chats = Array.isArray(recap.chatMessages) ? recap.chatMessages : [];
  const participants = Array.isArray(recap.participants) ? recap.participants : [];
  const safeTitle = escHtml(recap.title || `Meeting ${recap.roomId || ''}`);
  const safeRoomId = escHtml(recap.roomId || '');
  const transcriptPreview = transcripts.slice(0, 3).map((entry) => `
    <li><strong>${escHtml(entry.username || 'Participant')}:</strong> ${escHtml(entry.text || '')}</li>
  `).join('');
  const chatPreview = chats.slice(0, 3).map((entry) => `
    <li><strong>${escHtml(entry.username || 'Participant')}:</strong> ${escHtml(entry.text || '')}</li>
  `).join('');

  recapPreview.innerHTML = `
    <div class="recap-preview-head">
      <strong>${safeTitle}</strong>
      <span><i class="bi bi-hash"></i> ${safeRoomId}</span>
    </div>
    <div class="recap-preview-meta">
      <span><i class="bi bi-calendar3"></i> Ended ${fmtDate(recap.endedAt || recap.generatedAt || Date.now())}</span>
      <span><i class="bi bi-clock"></i> ${fmtDuration(recap.durationMs || 0)}</span>
      <span><i class="bi bi-people"></i> ${recap.participantCount || participants.length} participants</span>
    </div>
    <div class="recap-preview-columns">
      <div>
        <p class="recap-preview-label">Voice Highlights</p>
        ${transcriptPreview ? `<ul class="recap-preview-list">${transcriptPreview}</ul>` : '<p class="recap-preview-empty">No voice transcript entries.</p>'}
      </div>
      <div>
        <p class="recap-preview-label">Chat Highlights</p>
        ${chatPreview ? `<ul class="recap-preview-list">${chatPreview}</ul>` : '<p class="recap-preview-empty">No chat messages captured.</p>'}
      </div>
    </div>
  `;
}

function renderMeetingRecapHistory(items) {
  if (!recapHistoryList) return;
  currentRecapHistory = Array.isArray(items) ? items : [];
  if (!currentRecapHistory.length) {
    recapHistoryList.innerHTML = emptyState('bi-file-earmark-text', 'No MOM recaps available yet. End a meeting to generate one.');
    renderRecapPreview(null);
    return;
  }

  if (!selectedRecapRoomId || !currentRecapHistory.some((item) => item.roomId === selectedRecapRoomId)) {
    selectedRecapRoomId = currentRecapHistory[0].roomId;
  }

  recapHistoryList.innerHTML = currentRecapHistory.map((recap) => {
    const transcripts = Array.isArray(recap.transcripts) ? recap.transcripts : [];
    const chats = Array.isArray(recap.chatMessages) ? recap.chatMessages : [];
    const participants = Array.isArray(recap.participants) ? recap.participants : [];
    const roomId = escHtml(recap.roomId || '');
    const title = escHtml(recap.title || `Meeting ${recap.roomId || ''}`);
    const isActive = selectedRecapRoomId === recap.roomId;

    return `
      <div class="meeting-row">
        <div class="meeting-row-left">
          <div class="meeting-row-icon" style="background:rgba(16,185,129,0.12);color:var(--green);">
            <i class="bi bi-file-earmark-text"></i>
          </div>
          <div class="meeting-row-info">
            <strong>${title}</strong>
            <span>${fmtDate(recap.endedAt || recap.generatedAt || Date.now())} &nbsp;·&nbsp; <i class="bi bi-clock"></i> ${fmtDuration(recap.durationMs || 0)}</span>
            <span class="recap-metrics-line"><i class="bi bi-chat-left-text"></i> ${recap.summary?.transcriptCount || transcripts.length} voice notes &nbsp;·&nbsp; <i class="bi bi-chat-dots"></i> ${recap.summary?.chatCount || chats.length} chats &nbsp;·&nbsp; <i class="bi bi-people"></i> ${recap.participantCount || participants.length}</span>
          </div>
        </div>
        <div class="recap-row-actions">
          <span class="badge badge-green"><i class="bi bi-hash"></i> ${roomId}</span>
          <button class="btn btn-secondary recap-action-btn${isActive ? ' active' : ''}" data-recap-action="view" data-room-id="${roomId}">
            <i class="bi bi-eye"></i> View MOM
          </button>
          <button class="btn btn-secondary recap-action-btn" data-recap-action="download" data-room-id="${roomId}">
            <i class="bi bi-download"></i> Download PDF
          </button>
        </div>
      </div>
    `;
  }).join('');

  renderRecapPreview(recapHistoryLookup.get(selectedRecapRoomId) || null);
}

async function loadMeetingRecaps(historyItems) {
  recapHistoryLookup = new Map();
  if (!Array.isArray(historyItems) || !historyItems.length) {
    return [];
  }

  const seenRooms = new Set();
  const uniqueRoomIds = [];
  historyItems.forEach((meeting) => {
    const roomId = sanitizeMeetingId(meeting?.roomId || '');
    if (!roomId || seenRooms.has(roomId)) {
      return;
    }
    seenRooms.add(roomId);
    uniqueRoomIds.push(roomId);
  });

  const roomIds = uniqueRoomIds.slice(0, 20);
  if (!roomIds.length) {
    return [];
  }

  const recapResponses = await Promise.allSettled(
    roomIds.map((roomId) => apiRequest(`/api/meetings/${encodeURIComponent(roomId)}/recap`)),
  );

  const recaps = [];
  recapResponses.forEach((result, index) => {
    if (result.status !== 'fulfilled' || !result.value?.recap) {
      return;
    }

    const recap = result.value.recap;
    recapHistoryLookup.set(roomIds[index], recap);
    recaps.push(recap);
  });

  recaps.sort((a, b) => (b.endedAt || b.generatedAt || 0) - (a.endedAt || a.generatedAt || 0));
  return recaps;
}

async function downloadMeetingRecapPdfByRoom(roomId) {
  const safeRoomId = sanitizeMeetingId(roomId);
  if (!safeRoomId) {
    throw new Error('Invalid meeting ID for recap download.');
  }

  const apiBaseUrl = await (window.getApiBaseUrl ? window.getApiBaseUrl() : Promise.resolve(''));
  const token = getToken();
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const path = `/api/meetings/${encodeURIComponent(safeRoomId)}/recap.pdf`;
  const url = apiBaseUrl ? new URL(path, apiBaseUrl).toString() : path;
  const response = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Unable to download recap PDF.');
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `MeetRecap-${safeRoomId}-MOM.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

/* ── Data ────────────────────────────────────────────────── */
async function refreshDashboardData() {
  const [scheduledRes, historyRes] = await Promise.all([
    apiRequest('/api/meetings/scheduled'),
    apiRequest('/api/meetings/history'),
  ]);

  const scheduled = scheduledRes.meetings || [];
  const history = historyRes.meetings || [];
  const recapHistory = await loadMeetingRecaps(history);

  renderScheduledMeetings(scheduled, scheduledList);
  renderScheduledMeetings(scheduled.slice(0, 3), overviewScheduledList);
  renderMeetingHistory(history);
  renderMeetingRecapHistory(recapHistory);
  scheduleMeetingReminders(scheduled);

  const totalMins = history.reduce((a, m) => a + Math.round((m.durationMs || 0) / 60000), 0);
  if (statTotal) statTotal.textContent = history.length;
  if (statScheduled) statScheduled.textContent = scheduled.length;
  if (statDuration) {
    statDuration.textContent = totalMins >= 60
      ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`
      : `${totalMins}m`;
  }
}

/* ── Meeting Title Dialog ────────────────────────────────── */
function finishMeetingTitleDialog(value) {
  if (meetingTitleResolver) {
    meetingTitleResolver(value);
    meetingTitleResolver = null;
  }
  closeDialog(meetingTitleDialog);
}

function askMeetingTitle(initial = 'Instant Meeting') {
  if (!meetingTitleDialog || !meetingTitleDialogInput) {
    const fallback = window.prompt('Enter meeting title', initial);
    if (fallback === null) return Promise.resolve(null);
    const safe = sanitizeMeetingTitle(fallback);
    return Promise.resolve(safe || null);
  }

  setScopedStatus(meetingTitleDialogStatus, '');
  meetingTitleDialogInput.value = initial;
  openDialog(meetingTitleDialog);
  setTimeout(() => meetingTitleDialogInput.focus(), 0);

  return new Promise((resolve) => {
    meetingTitleResolver = resolve;
  });
}

function submitMeetingTitleDialog() {
  const title = sanitizeMeetingTitle(meetingTitleDialogInput?.value || '');
  if (!title) {
    setScopedStatus(meetingTitleDialogStatus, 'Please enter a valid meeting title (1-60 characters).');
    return;
  }
  finishMeetingTitleDialog(title);
}

/* ── Navigate to Meeting ─────────────────────────────────── */
function redirectToMeeting(roomId, title = '') {
  const safe = sanitizeMeetingId(roomId);
  if (!safe) {
    setStatus('Please enter a valid meeting ID.');
    return;
  }
  const params = new URLSearchParams({ meeting: safe });
  const safeTitle = sanitizeMeetingTitle(title);
  if (safeTitle) params.set('title', safeTitle);
  window.location.href = `/meeting?${params.toString()}`;
}

async function copyMeetingInvite(roomId) {
  const safe = sanitizeMeetingId(roomId);
  if (!safe) {
    setStatus('Invalid meeting ID.');
    return;
  }

  const params = new URLSearchParams({ meeting: safe });
  const link = `${window.location.origin}/meeting?${params.toString()}`;
  try {
    await navigator.clipboard.writeText(link);
    setScopedStatus(scheduleStatusText, 'Meeting link copied! Share it with participants.', 'success');
    setTimeout(() => setScopedStatus(scheduleStatusText, ''), 3000);
  } catch {
    setScopedStatus(scheduleStatusText, 'Could not copy link. Please copy from browser URL.', 'error');
  }
}

window.redirectToMeeting = redirectToMeeting;
window.copyMeetingInvite = copyMeetingInvite;

/* ── Settings Actions ────────────────────────────────────── */
async function handleDesktopNotificationToggle() {
  if (typeof Notification === 'undefined') {
    setScopedStatus(settingsStatusText, 'This browser does not support desktop notifications.', 'error');
    if (desktopRemindersToggle) desktopRemindersToggle.checked = false;
    return;
  }

  const wantsEnabled = Boolean(desktopRemindersToggle?.checked);

  if (!wantsEnabled) {
    appSettings.desktopReminders = false;
    saveSettings();
    setScopedStatus(settingsStatusText, 'Desktop reminders disabled.', 'success');
    return;
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    appSettings.desktopReminders = permission === 'granted';
  } else if (Notification.permission === 'granted') {
    appSettings.desktopReminders = true;
  } else {
    appSettings.desktopReminders = false;
    setScopedStatus(settingsStatusText, 'Notification permission is blocked. Please allow it in browser settings.', 'error');
  }

  if (desktopRemindersToggle) desktopRemindersToggle.checked = Boolean(appSettings.desktopReminders);
  saveSettings();
  setScopedStatus(settingsStatusText, appSettings.desktopReminders ? 'Desktop reminders enabled.' : 'Desktop reminders disabled.', appSettings.desktopReminders ? 'success' : 'success');
  await refreshDashboardData();
}

function handleThemePresetChange() {
  appSettings.themePreset = appSettings.themePreset || 'dark';
  saveSettings();
  applyThemePreference();
}

function openChangePasswordDialog() {
  setScopedStatus(changePasswordStatus, '');
  if (newPasswordInput) newPasswordInput.value = '';
  if (confirmPasswordInput) confirmPasswordInput.value = '';
  openDialog(changePasswordDialog);
}

function openAskQuestionDialog() {
  setScopedStatus(askQuestionStatus, '');
  if (askQuestionInput) askQuestionInput.value = '';
  openDialog(askQuestionDialog);
  setTimeout(() => askQuestionInput?.focus(), 0);
}

async function sendAskQuestion() {
  const question = String(askQuestionInput?.value || '').trim();
  if (!question) {
    setScopedStatus(askQuestionStatus, 'Please type a question first.', 'error');
    return;
  }

  setLoading(askQuestionSend, true);
  try {
    await apiRequest('/api/send-email', 'POST', { question });
    setScopedStatus(askQuestionStatus, 'Question sent to support.', 'success');
    setTimeout(() => closeDialog(askQuestionDialog), 700);
  } catch (error) {
    setScopedStatus(askQuestionStatus, error?.message || 'Could not send your question. Please try again.', 'error');
  } finally {
    setLoading(askQuestionSend, false);
  }
}

function saveNewPassword() {
  const next = String(newPasswordInput?.value || '');
  const confirm = String(confirmPasswordInput?.value || '');

  if (next.length < 6) {
    setScopedStatus(changePasswordStatus, 'Password must be at least 6 characters.');
    return;
  }
  if (next !== confirm) {
    setScopedStatus(changePasswordStatus, 'Passwords do not match.');
    return;
  }

  localStorage.setItem('meetrecap.password.preview', btoa(next));
  setScopedStatus(changePasswordStatus, 'Password updated successfully for this demo profile.', 'success');
  setTimeout(() => closeDialog(changePasswordDialog), 600);
}

function bindInfoButtons() {
  aboutBtn?.addEventListener('click', () => openInfoDialog(
    'About MeetRecap',
    'A simple, login-first collaboration platform.',
    '<p>MeetRecap helps teams create, join, and schedule meetings quickly with a lightweight interface and real-time communication.</p>'
  ));

  privacyBtn?.addEventListener('click', () => openInfoDialog(
    'Privacy Policy',
    'How this app handles data.',
    '<p>This demo project stores session data and preferences in memory/local browser storage. Avoid sharing sensitive information. For production, add secure storage and compliance controls.</p>'
  ));

  termsBtn?.addEventListener('click', () => openInfoDialog(
    'Terms and Conditions',
    'Basic usage terms for this project.',
    '<ul><li>Use respectfully and lawfully.</li><li>Do not abuse meeting access.</li><li>You are responsible for any shared content.</li></ul>'
  ));

  faqBtn?.addEventListener('click', () => openInfoDialog(
    'Frequently Asked Questions',
    'Common answers for quick help.',
    '<ul><li><strong>How do I join?</strong> Use meeting ID from host.</li><li><strong>Can I schedule?</strong> Yes, from Schedule section.</li><li><strong>Can I change theme?</strong> Yes, from Settings.</li></ul>'
  ));

  askQuestionBtn?.addEventListener('click', openAskQuestionDialog);
}

function bindSettingsDelegates() {
  const settingsSection = document.getElementById('section-settings');
  if (!settingsSection) return;

  const runSettingsAction = (action) => {
    if (action === 'about') {
      openInfoDialog(
        'About MeetRecap',
        'A simple, login-first collaboration platform.',
        '<p>MeetRecap helps teams create, join, and schedule meetings quickly with a lightweight interface and real-time communication.</p>'
      );
      return;
    }

    if (action === 'privacy') {
      openInfoDialog(
        'Privacy Policy',
        'How this app handles data.',
        '<p>This demo project stores session data and preferences in memory/local browser storage. Avoid sharing sensitive information. For production, add secure storage and compliance controls.</p>'
      );
      return;
    }

    if (action === 'terms') {
      openInfoDialog(
        'Terms and Conditions',
        'Basic usage terms for this project.',
        '<ul><li>Use respectfully and lawfully.</li><li>Do not abuse meeting access.</li><li>You are responsible for any shared content.</li></ul>'
      );
      return;
    }

    if (action === 'faq') {
      openInfoDialog(
        'Frequently Asked Questions',
        'Common answers for quick help.',
        '<ul><li><strong>How do I join?</strong> Use meeting ID from host.</li><li><strong>Can I schedule?</strong> Yes, from Schedule section.</li><li><strong>Can I change theme?</strong> Yes, from Settings.</li></ul>'
      );
      return;
    }

    if (action === 'change-password') {
      openChangePasswordDialog();
      return;
    }

    if (action === 'ask-question') {
      openAskQuestionDialog();
    }
  };

  settingsSection.addEventListener('click', (event) => {
    const actionRow = event.target.closest('[data-settings-action]');
    if (actionRow && settingsSection.contains(actionRow)) {
      runSettingsAction(actionRow.dataset.settingsAction);
      return;
    }

    const target = event.target.closest('button');
    if (!target) return;
    if (target.id === 'changePasswordBtn') runSettingsAction('change-password');
  });

  settingsSection.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const actionRow = event.target.closest('[data-settings-action]');
    if (!actionRow || !settingsSection.contains(actionRow)) return;
    event.preventDefault();
    runSettingsAction(actionRow.dataset.settingsAction);
  });
}

/* ── Event Listeners ─────────────────────────────────────── */
createMeetingBtn?.addEventListener('click', async () => {
  const title = await askMeetingTitle('Instant Meeting');
  if (!title) return;
  redirectToMeeting(makeMeetingId(), title);
});

createMeetingBtnOv?.addEventListener('click', async () => {
  const title = await askMeetingTitle('Instant Meeting');
  if (!title) return;
  redirectToMeeting(makeMeetingId(), title);
});

joinMeetingBtn?.addEventListener('click', () => redirectToMeeting(meetingIdInput.value));

meetingIdInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') redirectToMeeting(meetingIdInput.value);
});

recapHistoryList?.addEventListener('click', async (event) => {
  const actionBtn = event.target.closest('[data-recap-action]');
  if (!actionBtn) return;

  const action = actionBtn.dataset.recapAction;
  const roomId = sanitizeMeetingId(actionBtn.dataset.roomId || '');
  if (!roomId) return;

  if (action === 'view') {
    selectedRecapRoomId = roomId;
    renderMeetingRecapHistory(currentRecapHistory);
    return;
  }

  if (action === 'download') {
    actionBtn.disabled = true;
    try {
      await downloadMeetingRecapPdfByRoom(roomId);
      setScopedStatus(scheduleStatusText, 'Recap PDF downloaded successfully.', 'success');
      setTimeout(() => setScopedStatus(scheduleStatusText, ''), 2500);
    } catch (error) {
      setScopedStatus(scheduleStatusText, error?.message || 'Could not download recap PDF.', 'error');
    } finally {
      actionBtn.disabled = false;
    }
  }
});

scheduleForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setScopedStatus(scheduleStatusText, '');
  const title = String(scheduleTitle.value || '').trim();
  const scheduledFor = new Date(String(scheduleDateTime.value || '')).getTime();

  if (!sanitizeMeetingTitle(title)) {
    setScopedStatus(scheduleStatusText, 'Please enter a valid title (1-60 characters).');
    return;
  }
  if (!Number.isFinite(scheduledFor)) {
    setScopedStatus(scheduleStatusText, 'Please choose a valid date and time.');
    return;
  }
  if (scheduledFor <= Date.now()) {
    setScopedStatus(scheduleStatusText, 'Please choose a future date and time.');
    return;
  }

  setLoading(scheduleSubmitBtn, true);
  try {
    await apiRequest('/api/meetings/schedule', 'POST', { title, roomId: makeMeetingId(), scheduledFor });
    scheduleForm.reset();
    await refreshDashboardData();
    setScopedStatus(scheduleStatusText, 'Meeting scheduled successfully! ✓', 'success');
    setTimeout(() => setScopedStatus(scheduleStatusText, ''), 3000);
  } catch (err) {
    setScopedStatus(scheduleStatusText, err.message || 'Unable to schedule meeting.');
  } finally {
    setLoading(scheduleSubmitBtn, false);
  }
});

displayNameInput?.addEventListener('change', () => {
  const safe = sanitizeDisplayName(displayNameInput.value);
  if (!safe && displayNameInput.value.trim()) {
    setScopedStatus(settingsStatusText, 'Display name must be 1-24 valid characters.', 'error');
    return;
  }
  appSettings.displayNameOverride = safe;
  saveSettings();
  applyIdentityUI();
  setScopedStatus(settingsStatusText, 'Display name updated.', 'success');
});

avatarUploadInput?.addEventListener('change', () => {
  const file = avatarUploadInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    setScopedStatus(settingsStatusText, 'Please upload an image file.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    appSettings.avatarDataUrl = String(reader.result || '');
    saveSettings();
    applyIdentityUI();
    setScopedStatus(settingsStatusText, 'Profile photo updated.', 'success');
  };
  reader.readAsDataURL(file);
});

clearAvatarBtn?.addEventListener('click', () => {
  appSettings.avatarDataUrl = '';
  if (avatarUploadInput) avatarUploadInput.value = '';
  saveSettings();
  applyIdentityUI();
  setScopedStatus(settingsStatusText, 'Profile photo removed.', 'success');
});

mirrorToggle?.addEventListener('change', () => {
  localStorage.setItem('mirrorSelfVideo', String(mirrorToggle.checked));
  setScopedStatus(settingsStatusText, 'Mirror preference updated.', 'success');
});

defaultMicToggle?.addEventListener('change', () => {
  appSettings.defaultMicOn = defaultMicToggle.checked;
  saveSettings();
  setScopedStatus(settingsStatusText, 'Default mic preference updated.', 'success');
});

defaultCamToggle?.addEventListener('change', () => {
  appSettings.defaultCamOn = defaultCamToggle.checked;
  saveSettings();
  setScopedStatus(settingsStatusText, 'Default camera preference updated.', 'success');
});

notifyJoinLeaveToggle?.addEventListener('change', () => {
  appSettings.soundJoinLeave = notifyJoinLeaveToggle.checked;
  saveSettings();
  setScopedStatus(settingsStatusText, 'Join/leave sound preference updated.', 'success');
});

notifyChatToggle?.addEventListener('change', () => {
  appSettings.soundChat = notifyChatToggle.checked;
  saveSettings();
  setScopedStatus(settingsStatusText, 'Chat sound preference updated.', 'success');
});

desktopRemindersToggle?.addEventListener('change', handleDesktopNotificationToggle);

reminderTimingButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    const value = Number(btn.dataset.value || 10);
    appSettings.reminderMinutes = value;
    updateSegmentedButtons(reminderTimingButtons, String(value));
    saveSettings();
    await refreshDashboardData();
    setScopedStatus(settingsStatusText, 'Reminder timing updated.', 'success');
  });
});

themePresetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    appSettings.themePreset = btn.dataset.value || 'dark';
    updateSegmentedButtons(themePresetButtons, appSettings.themePreset);
    handleThemePresetChange();
    setScopedStatus(settingsStatusText, 'Theme preset updated.', 'success');
  });
});

changePasswordBtn?.addEventListener('click', openChangePasswordDialog);
changePasswordCancel?.addEventListener('click', () => closeDialog(changePasswordDialog));
changePasswordConfirm?.addEventListener('click', saveNewPassword);

askQuestionCancel?.addEventListener('click', () => closeDialog(askQuestionDialog));
askQuestionSend?.addEventListener('click', sendAskQuestion);

askQuestionDialog?.addEventListener('click', (e) => {
  if (e.target === askQuestionDialog) closeDialog(askQuestionDialog);
});

settingsInfoDialogClose?.addEventListener('click', () => closeDialog(settingsInfoDialog));
settingsInfoDialog?.addEventListener('click', (e) => {
  if (e.target === settingsInfoDialog) closeDialog(settingsInfoDialog);
});
changePasswordDialog?.addEventListener('click', (e) => {
  if (e.target === changePasswordDialog) closeDialog(changePasswordDialog);
});

logoutBtn?.addEventListener('click', async () => {
  try { await apiRequest('/api/auth/logout', 'POST'); } catch {}
  clearToken();
  window.location.replace('/login');
});

meetingTitleDialogCancel?.addEventListener('click', () => finishMeetingTitleDialog(null));
meetingTitleDialogConfirm?.addEventListener('click', submitMeetingTitleDialog);
meetingTitleDialogInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitMeetingTitleDialog();
  }
});
meetingTitleDialog?.addEventListener('click', (e) => {
  if (e.target === meetingTitleDialog) finishMeetingTitleDialog(null);
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!meetingTitleDialog?.classList.contains('hidden')) finishMeetingTitleDialog(null);
  if (!settingsInfoDialog?.classList.contains('hidden')) closeDialog(settingsInfoDialog);
  if (!changePasswordDialog?.classList.contains('hidden')) closeDialog(changePasswordDialog);
  if (!askQuestionDialog?.classList.contains('hidden')) closeDialog(askQuestionDialog);
});

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (appSettings.themePreset === 'system') {
      applyThemePreference();
    }
  });
}

bindInfoButtons();
bindSettingsDelegates();

/* ── Init ────────────────────────────────────────────────── */
async function initializeDashboard() {
  if (!getToken()) {
    window.location.replace('/login?next=/dashboard');
    return;
  }

  loadSettings();
  applyThemePreference();
  applySettingsControls();

  let me;
  try {
    me = await apiRequest('/api/auth/me');
  } catch {
    clearToken();
    window.location.replace('/login?next=/dashboard');
    return;
  }

  try {
    currentServerDisplayName = me.user.displayName;
    applyIdentityUI();
    await refreshDashboardData();
  } catch (err) {
    setStatus(err?.message || 'Could not load dashboard data.');
  }
}

initializeDashboard();
