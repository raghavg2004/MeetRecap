/* ── Dashboard JS ────────────────────────────────────────── */

/* ── DOM References ──────────────────────────────────────── */
const welcomeText        = document.getElementById('welcomeText');
const userNameLabel      = document.getElementById('userNameLabel');
const userAvatar         = document.getElementById('userAvatar');
const logoutBtn          = document.getElementById('logoutBtn');
const createMeetingBtn   = document.getElementById('createMeetingBtn');
const createMeetingBtnOv = document.getElementById('createMeetingBtnOverview');
const joinMeetingBtn     = document.getElementById('joinMeetingBtn');
const meetingIdInput     = document.getElementById('meetingIdInput');
const scheduleForm       = document.getElementById('scheduleForm');
const scheduleTitle      = document.getElementById('scheduleTitle');
const scheduleDateTime   = document.getElementById('scheduleDateTime');
const scheduleSubmitBtn  = document.getElementById('scheduleSubmitBtn');
const scheduleStatusText = document.getElementById('scheduleStatusText');
const scheduledList      = document.getElementById('scheduledList');
const overviewScheduledList = document.getElementById('overviewScheduledList');
const historyList        = document.getElementById('historyList');
const mirrorToggle       = document.getElementById('mirrorToggle');
const themeToggleBtn     = document.getElementById('themeToggleBtn');
const statusText         = document.getElementById('statusText');
const mobileMenuBtn      = document.getElementById('mobileMenuBtn');
const sidebar            = document.getElementById('sidebar');
const mobileBackdrop     = document.getElementById('mobileSidebarBackdrop');
const mobileNavLinks     = document.querySelectorAll('.mobile-nav-link[data-section]');
const meetingTitleDialog = document.getElementById('meetingTitleDialog');
const meetingTitleDialogInput = document.getElementById('meetingTitleDialogInput');
const meetingTitleDialogStatus = document.getElementById('meetingTitleDialogStatus');
const meetingTitleDialogCancel = document.getElementById('meetingTitleDialogCancel');
const meetingTitleDialogConfirm = document.getElementById('meetingTitleDialogConfirm');

/* Stats */
const statTotal          = document.getElementById('statTotal');
const statScheduled      = document.getElementById('statScheduled');
const statDuration       = document.getElementById('statDuration');

/* ── Helpers ─────────────────────────────────────────────── */
function getToken()  { return localStorage.getItem('authToken') || ''; }
function clearToken(){ localStorage.removeItem('authToken'); }

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

function makeMeetingId() {
  const l = Math.random().toString(36).slice(2, 6).toUpperCase();
  const n = Math.random().toString(10).slice(2, 6);
  return `${l}-${n}`;
}

let meetingTitleResolver = null;

function finishMeetingTitleDialog(value) {
  if (meetingTitleResolver) {
    meetingTitleResolver(value);
    meetingTitleResolver = null;
  }

  if (meetingTitleDialog) meetingTitleDialog.classList.add('hidden');
  document.body.classList.remove('dialog-open');
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
  meetingTitleDialog.classList.remove('hidden');
  document.body.classList.add('dialog-open');
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

function fmtDate(ms) { return new Date(ms).toLocaleString(undefined, { dateStyle:'medium', timeStyle:'short' }); }
function fmtDuration(ms) {
  const mins = Math.max(1, Math.round(ms / 60000));
  return mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
}

function initials(name) {
  return (name || 'U').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
}

function setLoading(btn, loading) {
  if (!btn) return;
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

function applyThemePreference() {
  const theme = localStorage.getItem('dashboardTheme') || 'dark';
  document.body.classList.toggle('theme-light', theme === 'light');
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === 'light' ? 'Light Theme' : 'Dark Theme';
  }
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
    method, headers, credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

/* ── Sidebar Navigation ──────────────────────────────────── */
const sidebarLinks = document.querySelectorAll('.sidebar-link[data-section]');
const sections     = document.querySelectorAll('.dash-section');

function showSection(name) {
  sections.forEach(s => s.classList.remove('active'));
  sidebarLinks.forEach(l => l.classList.remove('active'));
  mobileNavLinks.forEach(l => l.classList.remove('active'));

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

sidebarLinks.forEach(link => {
  link.addEventListener('click', () => showSection(link.dataset.section));
});

mobileNavLinks.forEach(link => {
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

/* Quick-action buttons that navigate to a section */
document.querySelectorAll('[data-section]').forEach(el => {
  if (el.tagName === 'BUTTON' && !el.classList.contains('sidebar-link') && !el.classList.contains('mobile-nav-link')) {
    el.addEventListener('click', (e) => {
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
  container.innerHTML = items.map(m => `
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
  historyList.innerHTML = items.map(m => `
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

function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ── Data ────────────────────────────────────────────────── */
async function refreshDashboardData() {
  const [scheduledRes, historyRes] = await Promise.all([
    apiRequest('/api/meetings/scheduled'),
    apiRequest('/api/meetings/history'),
  ]);

  const scheduled = scheduledRes.meetings || [];
  const history = historyRes.meetings || [];

  renderScheduledMeetings(scheduled, scheduledList);
  renderScheduledMeetings(scheduled.slice(0, 3), overviewScheduledList);
  renderMeetingHistory(history);

  /* Stats */
  const totalMins = history.reduce((a, m) => a + Math.round((m.durationMs || 0) / 60000), 0);
  if (statTotal) statTotal.textContent = history.length;
  if (statScheduled) statScheduled.textContent = scheduled.length;
  if (statDuration) {
    statDuration.textContent = totalMins >= 60
      ? `${Math.floor(totalMins/60)}h ${totalMins%60}m`
      : `${totalMins}m`;
  }
}

/* ── Mirror Preference ───────────────────────────────────── */
function applyMirrorPreference() {
  const enabled = localStorage.getItem('mirrorSelfVideo') === 'true';
  mirrorToggle.checked = enabled;
}

/* ── Navigate to Meeting ─────────────────────────────────── */
function redirectToMeeting(roomId, title = '') {
  const safe = sanitizeMeetingId(roomId);
  if (!safe) { setStatus('Please enter a valid meeting ID.'); return; }
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

joinMeetingBtn?.addEventListener('click',     () => redirectToMeeting(meetingIdInput.value));

meetingIdInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') redirectToMeeting(meetingIdInput.value);
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

mirrorToggle?.addEventListener('change', () => {
  localStorage.setItem('mirrorSelfVideo', String(mirrorToggle.checked));
});

themeToggleBtn?.addEventListener('click', () => {
  const nextTheme = document.body.classList.contains('theme-light') ? 'dark' : 'light';
  localStorage.setItem('dashboardTheme', nextTheme);
  applyThemePreference();
});

logoutBtn?.addEventListener('click', async () => {
  try { await apiRequest('/api/auth/logout', 'POST'); } catch {}
  clearToken();
  window.location.replace('/login');
});

meetingTitleDialogCancel?.addEventListener('click', () => {
  finishMeetingTitleDialog(null);
});

meetingTitleDialogConfirm?.addEventListener('click', submitMeetingTitleDialog);

meetingTitleDialogInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitMeetingTitleDialog();
  }
});

meetingTitleDialog?.addEventListener('click', (e) => {
  if (e.target === meetingTitleDialog) {
    finishMeetingTitleDialog(null);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && meetingTitleDialog && !meetingTitleDialog.classList.contains('hidden')) {
    finishMeetingTitleDialog(null);
  }
});

/* ── Init ────────────────────────────────────────────────── */
async function initializeDashboard() {
  if (!getToken()) { window.location.replace('/login?next=/dashboard'); return; }

  let me;
  try {
    me = await apiRequest('/api/auth/me');
  } catch {
    clearToken();
    window.location.replace('/login?next=/dashboard');
    return;
  }

  try {
    const name = me.user.displayName;
    welcomeText.textContent = name;
    userNameLabel.textContent = name;
    userAvatar.textContent = initials(name);
    applyThemePreference();
    applyMirrorPreference();
    await refreshDashboardData();
  } catch (err) {
    setStatus(err?.message || 'Could not load dashboard data.');
  }
}

initializeDashboard();
