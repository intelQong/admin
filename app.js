‘use strict’;

const WORKER       = ‘https://summer-shadow-2ad9.intelqong.workers.dev’;
const ATTEMPT_KEY  = ‘iq_att’;
const LOCKOUT_KEY  = ‘iq_lock’;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 5 * 60 * 1000;

async function sha256(str) {
const buf = await crypto.subtle.digest(‘SHA-256’, new TextEncoder().encode(str));
return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,‘0’)).join(’’);
}
let _pinHash = null;

// ── API ──────────────────────────────────────────────────────────────────────

async function apiAuth(hash) {
const r = await fetch(WORKER + ‘/auth’, { method:‘POST’, headers:{‘Content-Type’:‘application/json’}, body:JSON.stringify({hash}) });
if (!r.ok) return {ok:false};
return r.json();
}

async function apiGetLinks() {
setSyncState(‘syncing’);
try {
const r = await fetch(WORKER + ‘/links’, { headers:{‘X-Pin-Hash’:_pinHash} });
if (!r.ok) throw new Error(r.status);
const data = await r.json();
setSyncState(‘ok’);
localStorage.setItem(‘iq_cache’, JSON.stringify(data.links));
return data.links;
} catch {
setSyncState(‘error’);
showToast(‘Sync failed - showing cached data’);
return JSON.parse(localStorage.getItem(‘iq_cache’) || ‘[]’);
}
}

async function apiSaveLinks(links) {
setSyncState(‘syncing’);
try {
const r = await fetch(WORKER + ‘/links’, { method:‘POST’, headers:{‘Content-Type’:‘application/json’,‘X-Pin-Hash’:_pinHash}, body:JSON.stringify({links}) });
if (!r.ok) throw new Error(r.status);
localStorage.setItem(‘iq_cache’, JSON.stringify(links));
setSyncState(‘ok’);
showToast(‘Saved’);
} catch {
setSyncState(‘error’);
localStorage.setItem(‘iq_cache’, JSON.stringify(links));
showToast(‘Sync failed - saved to cache’);
}
}

// ── UI HELPERS ───────────────────────────────────────────────────────────────

function syncHV(i) { i.classList.toggle(‘hv’, i.value.length > 0); }

function showStep(id) {
document.querySelectorAll(’.step’).forEach(s => s.classList.remove(‘active’));
document.getElementById(id).classList.add(‘active’);
}

function shake() {
const c = document.getElementById(‘g-card’);
c.classList.remove(‘shake’);
void c.offsetWidth;
c.classList.add(‘shake’);
}

function setBanner(id, msg) {
const el = document.getElementById(id);
if (!el) return;
if (msg) {
const s = document.getElementById(id + ‘-msg’) || el.querySelector(‘span:last-child’);
if (s) s.textContent = msg;
el.classList.add(‘show’);
} else {
el.classList.remove(‘show’);
}
}

function togglePw() {
const i = document.getElementById(‘pw-input’), ic = document.getElementById(‘eye-icon’);
i.type = i.type === ‘password’ ? ‘text’ : ‘password’;
ic.textContent = i.type === ‘password’ ? ‘visibility’ : ‘visibility_off’;
}

function setSyncState(s) {
const d = document.getElementById(‘sync-dot’);
if (!d) return;
d.className = ‘sync-dot’ + (s !== ‘ok’ ? ’ ’ + s : ‘’);
}

let _toastT;
function showToast(m) {
const t = document.getElementById(‘toast’);
t.textContent = m;
t.classList.add(‘show’);
clearTimeout(_toastT);
_toastT = setTimeout(() => t.classList.remove(‘show’), 2500);
}

function copyText(text) {
if (navigator.clipboard && navigator.clipboard.writeText)
return navigator.clipboard.writeText(text).catch(() => execCopy(text));
execCopy(text);
}

function execCopy(text) {
const el = document.createElement(‘textarea’);
el.value = text;
el.style.cssText = ‘position:fixed;opacity:0’;
document.body.appendChild(el);
el.focus();
el.select();
try { document.execCommand(‘copy’); } catch(e) {}
document.body.removeChild(el);
}

// ── AUTH ─────────────────────────────────────────────────────────────────────

function checkEmail() {
showStep(‘step-password’);
setTimeout(() => document.getElementById(‘pw-input’).focus(), 60);
const lu = parseInt(localStorage.getItem(LOCKOUT_KEY) || ‘0’);
if (Date.now() < lu) startLockout(lu);
}

function backToEmail() {
showStep(‘step-email’);
setBanner(‘pw-err’, null);
const pw = document.getElementById(‘pw-input’);
pw.value = ‘’;
pw.classList.remove(‘hv’, ‘err’);
}

async function checkPin() {
const lu = parseInt(localStorage.getItem(LOCKOUT_KEY) || ‘0’);
if (Date.now() < lu) return;
const val = document.getElementById(‘pw-input’).value;
if (!val) { setBanner(‘pw-err’, ‘Enter a password’); return; }
const btn = document.getElementById(‘pw-btn’);
btn.classList.add(‘loading’);
setBanner(‘pw-err’, null);
try {
const hash = await sha256(val);
const res = await apiAuth(hash);
if (res.ok) {
localStorage.removeItem(ATTEMPT_KEY);
localStorage.removeItem(LOCKOUT_KEY);
_pinHash = hash;
btn.classList.remove(‘loading’);
await unlockApp();
return;
}
} catch {
btn.classList.remove(‘loading’);
setBanner(‘pw-err’, ‘Could not reach server. Check your connection.’);
return;
}
btn.classList.remove(‘loading’);
shake();
document.getElementById(‘pw-input’).value = ‘’;
document.getElementById(‘pw-input’).classList.remove(‘hv’);
let att = parseInt(localStorage.getItem(ATTEMPT_KEY) || ‘0’) + 1;
localStorage.setItem(ATTEMPT_KEY, att);
const left = MAX_ATTEMPTS - att;
if (att >= MAX_ATTEMPTS) {
localStorage.setItem(LOCKOUT_KEY, Date.now() + LOCKOUT_MS);
setBanner(‘pw-err’, null);
startLockout(Date.now() + LOCKOUT_MS);
} else {
setBanner(‘pw-err’, ‘Wrong password - ’ + left + ’ attempt’ + (left === 1 ? ‘’ : ‘s’) + ’ remaining.’);
}
}

let _lockTimer = null;
function startLockout(until) {
const btn = document.getElementById(‘pw-btn’), inp = document.getElementById(‘pw-input’);
inp.disabled = true;
btn.disabled = true;
document.getElementById(‘pw-lockout’).classList.add(‘show’);
setBanner(‘pw-err’, null);
function tick() {
const rem = Math.ceil((until - Date.now()) / 1000);
if (rem <= 0) {
clearInterval(_lockTimer);
document.getElementById(‘pw-lockout’).classList.remove(‘show’);
inp.disabled = false;
btn.disabled = false;
localStorage.removeItem(LOCKOUT_KEY);
localStorage.removeItem(ATTEMPT_KEY);
} else {
const mm = String(Math.floor(rem / 60)).padStart(2, ‘0’), ss = String(rem % 60).padStart(2, ‘0’);
document.getElementById(‘lockout-msg’).textContent = ’Too many attempts - try again in ’ + mm + ‘:’ + ss;
}
}
tick();
_lockTimer = setInterval(tick, 1000);
}

async function unlockApp() {
links = await apiGetLinks();
document.getElementById(‘lock-screen’).classList.add(‘hidden’);
document.getElementById(‘app’).classList.add(‘visible’);
document.getElementById(‘fab’).style.display = ‘flex’;
document.getElementById(‘stat-date’).textContent = new Date().toLocaleDateString(‘en-US’, {month:‘short’, day:‘numeric’});
renderLinks();
checkPasskeyAfterLogin();
}

function lockApp() {
_pinHash = null;
document.getElementById(‘app’).classList.remove(‘visible’);
document.getElementById(‘lock-screen’).classList.remove(‘hidden’);
document.getElementById(‘fab’).style.display = ‘none’;
const pw = document.getElementById(‘pw-input’);
pw.value = ‘’;
pw.classList.remove(‘hv’, ‘err’);
setBanner(‘pw-err’, null);
showStep(‘step-email’);
}

async function syncNow() { showToast(‘Syncing…’); links = await apiGetLinks(); renderLinks(); }

// ── PASSKEY ──────────────────────────────────────────────────────────────────

function bufToB64url(buf) {
return btoa(String.fromCharCode(…new Uint8Array(buf)))
.replace(/+/g, ‘-’).replace(///g, ‘_’).replace(/=/g, ‘’);
}

function b64urlToBuf(b64) {
const s = atob(b64.replace(/-/g, ‘+’).replace(/_/g, ‘/’));
return Uint8Array.from(s, c => c.charCodeAt(0)).buffer;
}

async function checkPasskeySupport() {
if (!window.PublicKeyCredential) return false;
try {
return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
} catch { return false; }
}

async function initPasskeyButton() {
const supported = await checkPasskeySupport();
const r = await fetch(WORKER + ‘/passkey/status’).catch(() => null);
const status = r ? await r.json().catch(() => ({registered:false})) : {registered:false};
const btn = document.getElementById(‘passkey-login-btn’);
const div = document.getElementById(‘passkey-divider’);
if (supported && status.registered) {
btn.style.display = ‘flex’;
div.style.display = ‘flex’;
}
}

async function passkeyLogin() {
const btn = document.getElementById(‘passkey-login-btn’);
btn.classList.add(‘loading’);
try {
const cr = await fetch(WORKER + ‘/passkey/challenge’, {method:‘POST’});
const { challenge } = await cr.json();

```
const assertion = await navigator.credentials.get({
  publicKey: {
    challenge: b64urlToBuf(challenge),
    rpId: 'admin.intelqong.link',
    userVerification: 'required',
    timeout: 60000,
  }
});

const resp = assertion.response;
const result = await fetch(WORKER + '/passkey/authenticate', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({
    credentialId: bufToB64url(assertion.rawId),
    clientDataJSON: bufToB64url(resp.clientDataJSON),
    authenticatorData: bufToB64url(resp.authenticatorData),
    signature: bufToB64url(resp.signature),
  })
});
const data = await result.json();
if (!data.ok) throw new Error(data.error);

_pinHash = data.pinHash;
btn.classList.remove('loading');
await unlockApp();
```

} catch(e) {
btn.classList.remove(‘loading’);
if (e.name === ‘NotAllowedError’) showToast(‘Passkey cancelled’);
else showToast(‘Passkey failed - try password’);
}
}

async function registerPasskey() {
if (!_pinHash) { showToast(‘Sign in with PIN first’); return; }
const supported = await checkPasskeySupport();
if (!supported) { showToast(‘Passkeys not supported on this device’); return; }

try {
const cr = await fetch(WORKER + ‘/passkey/challenge’, {method:‘POST’});
const { challenge } = await cr.json();

```
const cred = await navigator.credentials.create({
  publicKey: {
    challenge: b64urlToBuf(challenge),
    rp: { id: 'admin.intelqong.link', name: 'Intelqong Admin' },
    user: { id: new TextEncoder().encode('intelqong-admin'), name: 'admin', displayName: 'Admin' },
    pubKeyCredParams: [
      { type:'public-key', alg:-7   }, // ES256
      { type:'public-key', alg:-257 }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'required',
    },
    timeout: 60000,
    attestation: 'none',
  }
});

const resp = cred.response;
const r = await fetch(WORKER + '/passkey/register', {
  method: 'POST',
  headers: {'Content-Type':'application/json', 'X-Pin-Hash':_pinHash},
  body: JSON.stringify({
    credentialId: bufToB64url(cred.rawId),
    publicKey: bufToB64url((resp.getPublicKey && resp.getPublicKey()) || resp.attestationObject),
    clientDataJSON: bufToB64url(resp.clientDataJSON),
    attestationObject: bufToB64url(resp.attestationObject),
  })
});
const data = await r.json();
if (!data.ok) throw new Error(data.error);

localStorage.setItem('iq_passkey', '1');
showToast('Passkey registered! Use Face ID / fingerprint next time');
updatePasskeySettingsRow(true);
```

} catch(e) {
if (e.name === ‘NotAllowedError’) showToast(‘Passkey setup cancelled’);
else showToast(’Passkey setup failed: ’ + e.message);
}
}

async function removePasskey() {
if (!_pinHash) return;
const r = await fetch(WORKER + ‘/passkey’, { method:‘DELETE’, headers:{‘X-Pin-Hash’:_pinHash} });
const data = await r.json();
if (data.ok) {
localStorage.removeItem(‘iq_passkey’);
showToast(‘Passkey removed’);
updatePasskeySettingsRow(false);
}
}

function updatePasskeySettingsRow(registered) {
const txt = document.getElementById(‘passkey-status-txt’);
const btn = document.getElementById(‘passkey-settings-btn’);
if (!txt || !btn) return;
if (registered) {
txt.textContent = ‘Active - Face ID / fingerprint login enabled’;
btn.textContent = ‘Remove’;
} else {
txt.textContent = ‘Not set up’;
btn.textContent = ‘Setup’;
}
}

async function passkeySettingsAction() {
const btn = document.getElementById(‘passkey-settings-btn’);
if (btn.textContent.trim() === ‘Remove’) {
if (confirm(‘Remove passkey? You will need to use your PIN to sign in.’)) removePasskey();
} else {
registerPasskey();
}
}

async function checkPasskeyAfterLogin() {
const supported = await checkPasskeySupport();
if (!supported) return;
const r = await fetch(WORKER + ‘/passkey/status’).catch(() => null);
const status = r ? await r.json().catch(() => ({registered:false})) : {registered:false};
updatePasskeySettingsRow(status.registered);
}

// ── INIT ─────────────────────────────────────────────────────────────────────

(function () {
const lu = parseInt(localStorage.getItem(LOCKOUT_KEY) || ‘0’);
if (Date.now() >= lu) {
localStorage.removeItem(LOCKOUT_KEY);
localStorage.removeItem(ATTEMPT_KEY);
}
showStep(‘step-email’);
initPasskeyButton();
})();

// ── DASHBOARD ────────────────────────────────────────────────────────────────

let links = [];
const PT = {home:‘Overview’, links:‘Links’, settings:‘Settings’};

function navigate(page, el) {
document.querySelectorAll(’.page’).forEach(p => p.classList.remove(‘active’));
document.querySelectorAll(’.nav-item’).forEach(n => n.classList.remove(‘active’));
document.getElementById(‘page-’ + page).classList.add(‘active’);
el.classList.add(‘active’);
document.getElementById(‘page-title’).textContent = PT[page];
document.getElementById(‘fab’).style.display = page === ‘settings’ ? ‘none’ : ‘flex’;
}

function renderLinks() {
const recent = document.getElementById(‘recent-links’), all = document.getElementById(‘all-links’);
document.getElementById(‘stat-links’).textContent = links.length;
document.getElementById(‘stat-cats’).textContent = new Set(links.map(l => l.cat).filter(Boolean)).size;
const empty = ‘<div class="empty"><span class="material-symbols-rounded">link_off</span><p>No links yet.</p></div>’;
if (!links.length) { recent.innerHTML = all.innerHTML = empty; return; }
const card = (l, i, del) =>
‘<div class="link-row" onclick="openPreview(' + i + ')">’ +
‘<div class="l-fav">’ + (l.icon || ‘🔗’) + ‘</div>’ +
‘<div class="l-info"><div class="l-title">’ + l.title + ‘</div><div class="l-url">’ + l.url + ‘</div></div>’ +
(l.cat ? ‘<span class="l-chip">’ + l.cat + ‘</span>’ : ‘’) +
(del ? ‘<button class="t-icon" onclick="editLink(event,' + i + ')" title="Edit"><span class="material-symbols-rounded" style="font-size:18px">edit</span></button>’ : ‘’) +
(del ? ‘<button class="t-icon" onclick="deleteLink(event,' + i + ')" title="Delete"><span class="material-symbols-rounded" style="font-size:18px">delete</span></button>’ : ‘’) +
‘</div>’;
all.innerHTML = links.map((l, i) => card(l, i, true)).join(’’);
recent.innerHTML = links.slice(-3).reverse().map(l => card(l, links.indexOf(l), false)).join(’’);
}

// ── PREVIEW MODAL ────────────────────────────────────────────────────────────

let _pvIdx = -1;
function openPreview(i) {
_pvIdx = i; const l = links[i];
document.getElementById(‘pv-emoji’).textContent    = l.icon || ‘🔗’;
document.getElementById(‘pv-name’).textContent     = l.title;
document.getElementById(‘pv-url’).textContent      = l.url;
document.getElementById(‘pv-category’).textContent = l.cat ? ’📁 ’ + l.cat : ‘Uncategorised’;
document.getElementById(‘preview-modal’).classList.add(‘open’);
}
function closePreview() { document.getElementById(‘preview-modal’).classList.remove(‘open’); _pvIdx = -1; }
function pvVisit() { if (_pvIdx < 0) return; window.open(links[_pvIdx].url, ‘_blank’, ‘noopener,noreferrer’); closePreview(); }
function pvCopy() { if (_pvIdx < 0) return; copyText(links[_pvIdx].url); showToast(‘URL copied’); }

// ── LINK CRUD ────────────────────────────────────────────────────────────────

async function deleteLink(e, i) { e.stopPropagation(); links.splice(i, 1); renderLinks(); await apiSaveLinks(links); }
async function clearLinks() { if (!confirm(‘Permanently remove all links?’)) return; links = []; renderLinks(); await apiSaveLinks(links); }

let _editIndex = -1;
function openModal() {
_editIndex = -1;
document.getElementById(‘modal-title-text’).textContent = ‘Add a link’;
document.getElementById(‘modal-save-btn’).textContent = ‘Save’;
document.getElementById(‘modal’).classList.add(‘open’);
document.getElementById(‘f-title’).focus();
}
function closeModal() {
document.getElementById(‘modal’).classList.remove(‘open’);
[‘f-title’,‘f-url’,‘f-cat’,‘f-icon’].forEach(id => document.getElementById(id).value = ‘’);
_editIndex = -1;
}
function editLink(e, i) {
e.stopPropagation(); _editIndex = i; const l = links[i];
document.getElementById(‘f-title’).value = l.title || ‘’;
document.getElementById(‘f-url’).value   = l.url   || ‘’;
document.getElementById(‘f-cat’).value   = l.cat   || ‘’;
document.getElementById(‘f-icon’).value  = l.icon  || ‘’;
document.getElementById(‘modal-title-text’).textContent = ‘Edit link’;
document.getElementById(‘modal-save-btn’).textContent   = ‘Update’;
document.getElementById(‘modal’).classList.add(‘open’);
document.getElementById(‘f-title’).focus();
}
async function saveLink() {
const title = document.getElementById(‘f-title’).value.trim(), url = document.getElementById(‘f-url’).value.trim();
if (!title || !url) return;
const entry = {title, url, cat: document.getElementById(‘f-cat’).value.trim(), icon: document.getElementById(‘f-icon’).value.trim()};
if (_editIndex >= 0) links[_editIndex] = entry; else links.push(entry);
closeModal(); renderLinks(); await apiSaveLinks(links);
}

// ── RESET PIN ────────────────────────────────────────────────────────────────

function openResetPin() {
document.getElementById(‘reset-pin-modal’).classList.add(‘open’);
setBanner(‘rp-err’, null);
[‘rp-current’,‘rp-new’,‘rp-confirm’].forEach(id => document.getElementById(id).value = ‘’);
document.getElementById(‘rp-current’).focus();
}
function closeResetPin() {
document.getElementById(‘reset-pin-modal’).classList.remove(‘open’);
[‘rp-current’,‘rp-new’,‘rp-confirm’].forEach(id => document.getElementById(id).value = ‘’);
setBanner(‘rp-err’, null);
}
async function submitResetPin() {
const current = document.getElementById(‘rp-current’).value,
newPin  = document.getElementById(‘rp-new’).value,
conf    = document.getElementById(‘rp-confirm’).value;
if (!current || !newPin || !conf) { setBanner(‘rp-err’, ‘All fields are required.’); return; }
if (newPin !== conf) { setBanner(‘rp-err’, ‘New passwords do not match.’); return; }
if (newPin.length < 4) { setBanner(‘rp-err’, ‘New password must be at least 4 characters.’); return; }
const btn = document.getElementById(‘rp-btn’);
btn.classList.add(‘loading’);
try {
const currentHash = await sha256(current);
const authRes = await apiAuth(currentHash);
if (!authRes.ok) throw new Error(‘wrong_current’);
const newHash = await sha256(newPin);
const r = await fetch(WORKER + ‘/reset-pin’, {
method: ‘POST’,
headers: {‘Content-Type’:‘application/json’, ‘X-Pin-Hash’:_pinHash},
body: JSON.stringify({newHash})
});
if (!r.ok) throw new Error(‘server_error’);
_pinHash = newHash;
btn.classList.remove(‘loading’);
closeResetPin();
showToast(‘Password updated successfully’);
} catch(e) {
btn.classList.remove(‘loading’);
if (e.message === ‘wrong_current’) setBanner(‘rp-err’, ‘Current password is incorrect.’);
else setBanner(‘rp-err’, ‘Failed to update password. Try again.’);
}
}
