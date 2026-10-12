/* ═══════════════════════════════════════════════════════════
   Wah Tat Plant — Admin Panel Shared JS
   ═══════════════════════════════════════════════════════════ */

// ── Auth check ──────────────────────────────────────────
async function checkAuth() {
    try {
        const res = await fetch('/api/session');
        const data = await res.json();
        if (!data.loggedIn) {
            window.location.href = '/admin/';
            return false;
        }
        document.getElementById('usernameDisplay').textContent = data.username || 'admin';
        return true;
    } catch (e) {
        window.location.href = '/admin/';
        return false;
    }
}

// ── Toast notification ──────────────────────────────────
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// ── API helpers ─────────────────────────────────────────
async function apiGet(url) {
    const res = await fetch(url);
    if (res.status === 401) { window.location.href = '/admin/'; return null; }
    return res.json();
}

async function apiPost(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (res.status === 401) { window.location.href = '/admin/'; return null; }
    return res.json();
}

async function apiPut(url, body) {
    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (res.status === 401) { window.location.href = '/admin/'; return null; }
    return res.json();
}

async function apiPatch(url, body) {
    const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (res.status === 401) { window.location.href = '/admin/'; return null; }
    return res.json();
}

async function apiDelete(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (res.status === 401) { window.location.href = '/admin/'; return null; }
    return res.json();
}

// ── Language Toggle ─────────────────────────────────────
let currentLang = localStorage.getItem('ucp-lang') || 'en';

function applyLang(lang) {
    currentLang = lang;
    // Update all toggle buttons on the page
    document.querySelectorAll('.lang-toggle').forEach(btn => {
        btn.innerHTML = currentLang === 'en'
            ? '<i class="fas fa-globe"></i> EN'
            : '<i class="fas fa-globe"></i> 中文';
        btn.title = currentLang === 'en' ? 'Switch to Chinese' : '切换到英文';
    });
    // Translate text elements
    document.querySelectorAll('[data-en][data-zh]').forEach(el => {
        const newText = el.getAttribute(`data-${currentLang}`);
        if (!newText) return;
        if (el.children.length === 0) {
            el.textContent = newText;
        } else {
            for (const node of el.childNodes) {
                if (node.nodeType === Node.TEXT_NODE) {
                    node.textContent = newText;
                    break;
                }
            }
        }
    });
    // Translate HTML-rich elements
    document.querySelectorAll('[data-en-html][data-zh-html]').forEach(el => {
        const html = el.getAttribute(`data-${currentLang}-html`);
        if (html) el.innerHTML = html;
    });
    // Translate placeholders
    document.querySelectorAll('[data-en-ph][data-zh-ph]').forEach(el => {
        const ph = el.getAttribute(`data-${currentLang}-ph`);
        if (ph) el.placeholder = ph;
    });
    localStorage.setItem('ucp-lang', currentLang);
}

// Apply saved language on load
if (currentLang === 'zh') applyLang('zh');

// ── Logout ──────────────────────────────────────────────
async function logout() {
    await apiPost('/api/logout', {});
    window.location.href = '/admin/';
}

// ── Format helpers ──────────────────────────────────────
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatDate(iso) {
    return new Date(iso).toLocaleString();
}
