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
renderLinks();
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
showStep(‘step-password’);
setTimeout(() => document.getElementById(‘pw-input’).focus(), 60);
}

async function syncNow() { showToast(‘Syncing…’); links = await apiGetLinks(); renderLinks(); }

// ── INIT ─────────────────────────────────────────────────────────────────────

(function () {
const lu = parseInt(localStorage.getItem(LOCKOUT_KEY) || ‘0’);
if (Date.now() >= lu) {
localStorage.removeItem(LOCKOUT_KEY);
localStorage.removeItem(ATTEMPT_KEY);
}
showStep(‘step-password’);
setTimeout(() => document.getElementById(‘pw-input’).focus(), 60);
if (Date.now() < parseInt(localStorage.getItem(LOCKOUT_KEY) || ‘0’)) {
startLockout(parseInt(localStorage.getItem(LOCKOUT_KEY)));
}
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

function card(l, i, del) {
return ‘<div class="link-row" onclick="openPreview(' + i + ')">’ +
‘<div class="l-fav">’ + (l.icon || ‘🔗’) + ‘</div>’ +
‘<div class="l-info"><div class="l-title">’ + l.title + ‘</div><div class="l-url">’ + l.url + ‘</div></div>’ +
(l.cat ? ‘<span class="l-chip">’ + l.cat + ‘</span>’ : ‘’) +
(del ? ‘<button class="t-icon" onclick="editLink(event,' + i + ')" title="Edit"><span class="material-symbols-rounded" style="font-size:18px">edit</span></button>’ : ‘’) +
(del ? ‘<button class="t-icon" onclick="deleteLink(event,' + i + ')" title="Delete"><span class="material-symbols-rounded" style="font-size:18px">delete</span></button>’ : ‘’) +
‘</div>’;
}

function filterHomeLinks(q) {
const label = document.getElementById(‘home-list-label’);
const clearBtn = document.getElementById(‘search-clear’);
clearBtn.style.display = q ? ‘flex’ : ‘none’;
if (!q) { label.textContent = ‘Recent’; renderLinks(); return; }
label.textContent = ‘Results’;
const results = links.filter(l =>
(l.title || ‘’).toLowerCase().includes(q.toLowerCase()) ||
(l.url || ‘’).toLowerCase().includes(q.toLowerCase()) ||
(l.cat || ‘’).toLowerCase().includes(q.toLowerCase())
);
const recent = document.getElementById(‘recent-links’);
const empty = ‘<div class="empty"><span class="material-symbols-rounded">search_off</span><p>No results for “’ + q + ‘”</p></div>’;
if (!results.length) { recent.innerHTML = empty; return; }
recent.innerHTML = results.map((l) => card(l, links.indexOf(l), false)).join(’’);
}

function clearSearch() {
const input = document.getElementById(‘home-search’);
input.value = ‘’;
filterHomeLinks(’’);
input.focus();
}

function renderLinks() {
const recent = document.getElementById(‘recent-links’), all = document.getElementById(‘all-links’);
const empty = ‘<div class="empty"><span class="material-symbols-rounded">link_off</span><p>No links yet.</p></div>’;
if (!links.length) { if(recent) recent.innerHTML = empty; if(all) all.innerHTML = empty; return; }
if(all) all.innerHTML = links.map((l, i) => card(l, i, true)).join(’’);
if(recent) recent.innerHTML = links.slice(-5).reverse().map(l => card(l, links.indexOf(l), false)).join(’’);
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

// ── THEME ────────────────────────────────────────────────────────────────────

const THEMES = [
{ id:‘red’,    label:‘Red’,    brand:’#c0392b’, brandH:’#96281b’, chip:’#fde8e6’, chipText:’#c0392b’ },
{ id:‘blue’,   label:‘Blue’,   brand:’#1a73e8’, brandH:’#1557b0’, chip:’#e8f0fe’, chipText:’#1a73e8’ },
{ id:‘green’,  label:‘Green’,  brand:’#1e8e3e’, brandH:’#157a32’, chip:’#e6f4ea’, chipText:’#1e8e3e’ },
{ id:‘purple’, label:‘Purple’, brand:’#7c4dff’, brandH:’#5e35b1’, chip:’#ede7f6’, chipText:’#7c4dff’ },
{ id:‘orange’, label:‘Orange’, brand:’#e65100’, brandH:’#bf360c’, chip:’#fbe9e7’, chipText:’#e65100’ },
{ id:‘teal’,   label:‘Teal’,   brand:’#00796b’, brandH:’#004d40’, chip:’#e0f2f1’, chipText:’#00796b’ },
];

const THEME_KEY = ‘iq_theme’;

function applyTheme(id) {
const t = THEMES.find(x => x.id === id) || THEMES[0];
const r = document.documentElement.style;
r.setProperty(’–brand’,     t.brand);
r.setProperty(’–brand-h’,   t.brandH);
r.setProperty(’–chip-bg’,   t.chip);
r.setProperty(’–chip-text’, t.chipText);
localStorage.setItem(THEME_KEY, t.id);
document.querySelectorAll(’.theme-swatch’).forEach(s => {
s.classList.toggle(‘active’, s.dataset.theme === t.id);
});
}

function initThemePicker() {
const picker = document.getElementById(‘theme-picker’);
if (!picker) return;
THEMES.forEach(t => {
const btn = document.createElement(‘button’);
btn.className = ‘theme-swatch’;
btn.dataset.theme = t.id;
btn.title = t.label;
btn.style.background = t.brand;
btn.setAttribute(‘aria-label’, t.label + ’ theme’);
btn.onclick = () => applyTheme(t.id);
picker.appendChild(btn);
});
applyTheme(localStorage.getItem(THEME_KEY) || ‘red’);
}

initThemePicker();
