/* ── Login JS — Tab switch, password toggle, loading states ── */

const statusText     = document.getElementById('statusText');
const loginForm      = document.getElementById('loginForm');
const registerForm   = document.getElementById('registerForm');
const loginEmail     = document.getElementById('loginEmail');
const loginPassword  = document.getElementById('loginPassword');
const registerName   = document.getElementById('registerName');
const registerEmail  = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const registerConsent = document.getElementById('registerConsent');
const tabSignIn      = document.getElementById('tabSignIn');
const tabRegister    = document.getElementById('tabRegister');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');
const registerSubmitBtn = document.getElementById('registerSubmitBtn');
const openPrivacyPolicy = document.getElementById('openPrivacyPolicy');
const openTermsConditions = document.getElementById('openTermsConditions');
const privacyModal = document.getElementById('privacyModal');
const termsModal = document.getElementById('termsModal');
const closePrivacyPolicy = document.getElementById('closePrivacyPolicy');
const closeTermsConditions = document.getElementById('closeTermsConditions');

/* ── Status ─────────────────────────────────────────────── */
function setStatus(message, type = 'error') {
  statusText.textContent = message || '';
  statusText.className = 'status ' + (message ? type : '');
}

/* ── Token helpers ──────────────────────────────────────── */
function getToken() { return localStorage.getItem('authToken') || ''; }
function setToken(t) { localStorage.setItem('authToken', t); }

/* ── Redirect helper ────────────────────────────────────── */
function getNextPath() {
  const p = new URLSearchParams(window.location.search).get('next');
  return (p && p.startsWith('/')) ? p : '/dashboard';
}

/* ── API ────────────────────────────────────────────────── */
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

/* ── Tab Switching ──────────────────────────────────────── */
function switchTab(tab) {
  const showLogin = (tab === 'login');
  tabSignIn.classList.toggle('active', showLogin);
  tabRegister.classList.toggle('active', !showLogin);
  loginForm.classList.toggle('active', showLogin);
  registerForm.classList.toggle('active', !showLogin);
  setStatus('');
}

tabSignIn.addEventListener('click', () => switchTab('login'));
tabRegister.addEventListener('click', () => switchTab('register'));

/* ── Password Toggle ────────────────────────────────────── */
function setupPasswordToggle(toggleId, inputEl, iconId) {
  document.getElementById(toggleId).addEventListener('click', () => {
    const isHidden = inputEl.type === 'password';
    inputEl.type = isHidden ? 'text' : 'password';
    document.getElementById(iconId).className = isHidden ? 'bi bi-eye-slash' : 'bi bi-eye';
  });
}
setupPasswordToggle('toggleLoginPwd', loginPassword, 'loginPwdIcon');
setupPasswordToggle('toggleRegisterPwd', registerPassword, 'registerPwdIcon');

/* ── Loading state ──────────────────────────────────────── */
function setLoading(btn, loading) {
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

function openModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('hidden');
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.add('hidden');
}

openPrivacyPolicy?.addEventListener('click', () => openModal(privacyModal));
openTermsConditions?.addEventListener('click', () => openModal(termsModal));
closePrivacyPolicy?.addEventListener('click', () => closeModal(privacyModal));
closeTermsConditions?.addEventListener('click', () => closeModal(termsModal));

privacyModal?.addEventListener('click', (e) => {
  if (e.target === privacyModal) closeModal(privacyModal);
});

termsModal?.addEventListener('click', (e) => {
  if (e.target === termsModal) closeModal(termsModal);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeModal(privacyModal);
  closeModal(termsModal);
});

/* ── Login ──────────────────────────────────────────────── */
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('');
  setLoading(loginSubmitBtn, true);
  try {
    const data = await apiRequest('/api/auth/login', 'POST', {
      email: loginEmail.value,
      password: loginPassword.value,
    });
    setToken(data.token);
    setStatus('Signed in! Redirecting…', 'success');
    setTimeout(() => window.location.replace(getNextPath()), 400);
  } catch (err) {
    setStatus(err.message);
    setLoading(loginSubmitBtn, false);
  }
});

/* ── Register ───────────────────────────────────────────── */
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('');

  if (!registerConsent?.checked) {
    setStatus('Please accept the Privacy Policy and Terms and Conditions to create an account.');
    return;
  }

  setLoading(registerSubmitBtn, true);
  try {
    const data = await apiRequest('/api/auth/register', 'POST', {
      email: registerEmail.value,
      password: registerPassword.value,
      displayName: registerName.value,
    });
    setToken(data.token);
    setStatus('Account created! Redirecting…', 'success');
    setTimeout(() => window.location.replace(getNextPath()), 400);
  } catch (err) {
    setStatus(err.message);
    setLoading(registerSubmitBtn, false);
  }
});

/* ── Check existing session ─────────────────────────────── */
async function checkExistingSession() {
  if (!getToken()) return;
  try {
    await apiRequest('/api/auth/me');
    window.location.replace(getNextPath());
  } catch {
    localStorage.removeItem('authToken');
  }
}

checkExistingSession();
