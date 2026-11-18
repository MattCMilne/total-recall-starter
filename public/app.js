// Total Recall Starter web app. Plain JavaScript, no build step.
// Pages: dashboard, chat, projects, archive, library, texts, connections, settings, custom pages.
import { renderMarkdown, esc } from './markdown.js';

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z"/><path d="M4 19V5"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  plug: '<path d="M9 2v5M15 2v5M6 7h12v3a6 6 0 0 1-12 0Z"/><path d="M12 16v6"/>',
  page: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16Z"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11h14V8M10 12h4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
};
const icon = (name, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.page}</svg>`;

const state = { me: null, settings: null, conversations: [], projects: [], route: '', chat: null, stream: null, menuOpen: false };
const $app = document.getElementById('app');

// ---------- helpers ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && path !== '/api/login') { state.me = null; renderLogin(); throw new Error('signed out'); }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status, data });
  return data;
}
function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
function confirmModal({ title, body, confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><p>${esc(body)}</p>
      <div class="row"><button class="btn" data-x>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirm)}</button></div></div>`;
    const done = (v) => { back.remove(); resolve(v); };
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-x]')) done(false); if (e.target.closest('[data-ok]')) done(true); });
    document.body.appendChild(back);
    back.querySelector('[data-ok]').focus();
  });
}
function promptModal({ title, label, value = '', confirm = 'Save' }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<form class="modal" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>
      <label class="field">${esc(label)}<input class="input" name="v" maxlength="120" value="${esc(value)}" required></label>
      <div class="row"><button type="button" class="btn" data-x>Cancel</button><button class="btn primary">${esc(confirm)}</button></div></form>`;
    const form = back.querySelector('form');
    const done = (v) => { back.remove(); resolve(v); };
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-x]')) done(null); });
    form.addEventListener('submit', (e) => { e.preventDefault(); done(form.v.value.trim() || null); });
    document.body.appendChild(back);
    form.v.focus();
    form.v.select();
  });
}
function popMenu(anchor, items) {
  closeMenus();
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}">${icon(it.icon)}${esc(it.label)}</button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w)) + 'px';
  m.style.top = (r.bottom + h + 8 > window.innerHeight ? r.top - h - 4 : r.bottom + 4) + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) { closeMenus(); items[Number(b.dataset.i)].run(); }
  });
  setTimeout(() => document.addEventListener('click', closeMenus, { once: true }), 0);
  m.querySelector('button')?.focus();
}
function closeMenus() {
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  document.querySelectorAll('[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

// ---------- theme ----------
function applyBrand() {
  const b = state.settings?.brand;
  if (!b) return;
  const dark = b.theme === 'dark' || (b.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--accent', b.accent);
  document.title = b.appName;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyBrand);

// ---------- routing ----------
function go(path, replace = false) {
  if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
  route();
}
window.addEventListener('popstate', route);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  document.querySelector('.shell')?.classList.remove('open');
  go(a.getAttribute('href'));
});

async function boot() {
  try {
    const me = await fetch('/api/me', { credentials: 'same-origin' });
    if (me.status === 401) return renderLogin();
    const data = await me.json();
    state.me = data.user;
    state.settings = data.settings;
    applyBrand();
    await Promise.all([loadConversations(), loadProjects()]);
    route();
  } catch {
    $app.innerHTML = '<div class="login"><div class="empty">Could not reach the app. Refresh to try again.</div></div>';
  }
}

async function loadConversations() { state.conversations = await api('/api/conversations'); }
async function loadProjects() { state.projects = await api('/api/projects'); }

function route() {
  if (!state.me) return renderLogin();
  const path = location.pathname;
  if (state.stream && !path.startsWith('/chat/')) { state.stream.close(); state.stream = null; }
  if (path === '/' || path === '') return go('/' + (state.settings.home === 'chat' ? 'chat' : state.settings.home), true);
  const [, section, id] = path.split('/');
  state.route = section;
  renderShell();
  const content = document.querySelector('.content');
  content.className = 'content';
  if (section === 'dashboard') return pageDashboard(content);
  if (section === 'chat') return id ? pageChat(content, id) : pageNewChat(content);
  if (section === 'projects') return id ? pageProject(content, id) : pageProjects(content);
  if (section === 'archive') return pageArchive(content);
  if (section === 'library') return pageLibrary(content);
  if (section === 'texts') return pageTexts(content, id ? decodeURIComponent(id) : null);
  if (section === 'connections') return pageConnections(content);
  if (section === 'settings') return pageSettings(content);
  if (section === 'p') return pageCustom(content, id);
  content.innerHTML = '<div class="empty">Page not found. <a href="/dashboard" data-link>Go to the dashboard</a></div>';
}

// ---------- login ----------
function renderLogin() {
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  $app.innerHTML = `<div class="login"><form id="login">
    <div class="logo">TR</div><h1>Sign in</h1><p>Your private Total Recall.</p>
    <label class="field">Email<input class="input" name="email" type="email" autocomplete="username" required></label>
    <label class="field">Password<input class="input" name="password" type="password" autocomplete="current-password" required></label>
    <div class="err" id="login-err" role="alert"></div>
    <button class="btn primary" style="width:100%;margin-top:6px">Sign in</button>
    <p class="powered" style="margin-top:18px">Powered by <b>Total Recall</b></p></form></div>`;
  document.getElementById('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/api/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } });
      history.replaceState({}, '', '/');
      boot();
    } catch (err) {
      document.getElementById('login-err').textContent = err.message;
    }
  });
}

// ---------- shell + sidebar ----------
function renderShell() {
  const b = state.settings.brand;
  if (!document.querySelector('.shell')) {
    $app.innerHTML = `<div class="shell"><aside class="sidebar" aria-label="Main menu"></aside>
      <main class="main"><div class="topbar"><button class="btn sm" id="open-menu" aria-label="Open menu">${icon('menu')}</button><strong id="top-title"></strong></div>
      <div class="content"></div></main></div>`;
    document.getElementById('open-menu').addEventListener('click', () => document.querySelector('.shell').classList.add('open'));
    document.querySelector('.shell').addEventListener('click', (e) => {
      if (e.target.classList.contains('shell')) e.currentTarget.classList.remove('open');
    });
  }
  document.getElementById('top-title').textContent = b.appName;
  renderSidebar();
}

function menuHref(item) {
  const custom = state.settings.customPages.find((p) => p.key === item.key);
  if (custom) return custom.kind === 'link' ? custom.url : `/p/${custom.key}`;
  return item.key === 'chat' ? '/chat' : `/${item.key}`;
}

function renderSidebar() {
  const s = state.settings;
  const b = s.brand;
  const side = document.querySelector('.sidebar');
  const nav = s.menu.filter((m) => !m.hidden).map((m) => {
    const custom = s.customPages.find((p) => p.key === m.key);
    const external = custom?.kind === 'link';
    const href = menuHref(m);
    const active = !external && (state.route === m.key || (custom && state.route === 'p' && location.pathname === href));
    return external
      ? `<a href="${esc(href)}" target="_blank" rel="noopener">${icon(m.icon)}${esc(m.title)}<span class="ext">↗</span></a>`
      : `<a href="${esc(href)}" data-link class="${active ? 'active' : ''}">${icon(m.icon)}${esc(m.title)}</a>`;
  }).join('');
  const currentChat = state.route === 'chat' ? location.pathname.split('/')[2] : null;
  const chats = state.conversations.filter((c) => !c.archived_at).map((c) => `
    <div class="chat-item ${c.id === currentChat ? 'active' : ''}" data-id="${c.id}">
      <a href="/chat/${c.id}" data-link title="${esc(c.title)}"><span class="slot">${c.starred ? icon('star', 'icon star') : ''}</span><span>${esc(c.title)}</span></a>
      <button class="dots" aria-label="Options for ${esc(c.title)}" aria-haspopup="menu" aria-expanded="false" data-chat-menu="${c.id}">${icon('dots')}</button>
    </div>`).join('');
  const initials = (state.me.name || state.me.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');
  side.innerHTML = `
    <div class="brand"><div class="logo">${esc(b.logoText)}</div><div><div class="brand-name">${esc(b.appName)}</div><div class="brand-agent">${esc(b.agentName)}</div></div></div>
    <button class="new-chat" id="new-chat">${icon('plus')}New chat</button>
    <nav class="nav">${nav}</nav>
    <div class="section-label">Chats</div>
    <div class="chat-list">${chats || '<div class="empty" style="padding:12px">No chats yet.</div>'}</div>
    <div class="sidebar-foot">
      <nav class="nav"><a href="/archive" data-link class="${state.route === 'archive' ? 'active' : ''}">${icon('archive')}Archived chats</a></nav>
      <button class="account" id="account" aria-haspopup="menu" aria-expanded="false"><span class="avatar">${esc(initials)}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(state.me.name || state.me.email)}</span>${icon('dots')}</button>
    </div>`;
  side.querySelector('#new-chat').addEventListener('click', () => { document.querySelector('.shell').classList.remove('open'); go('/chat'); });
  side.querySelector('#account').addEventListener('click', (e) => {
    e.stopPropagation();
    popMenu(e.currentTarget, [
      { icon: 'gear', label: 'Settings', run: () => go('/settings') },
      { icon: 'pencil', label: 'Change password', run: changePassword },
      '-',
      { icon: 'logout', label: 'Sign out', run: async () => { await api('/api/logout', { method: 'POST' }); state.me = null; history.replaceState({}, '', '/'); renderLogin(); } },
    ]);
  });
  side.querySelectorAll('[data-chat-menu]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    chatMenu(btn, state.conversations.find((c) => c.id === btn.dataset.chatMenu));
  }));
}

// The three-dot menu: Star, Rename, Move to project, Archive. Delete lives in Archived chats.
function chatMenu(anchor, conv) {
  if (!conv) return;
  const items = [
    { icon: 'star', label: conv.starred ? 'Unstar' : 'Star', run: () => updateChat(conv, { starred: !conv.starred }, conv.starred ? 'Star removed' : 'Starred') },
    { icon: 'pencil', label: 'Rename', run: async () => {
      const title = await promptModal({ title: 'Rename chat', label: 'Name', value: conv.title });
      if (title && title !== conv.title) updateChat(conv, { title }, 'Renamed');
    } },
    { icon: 'folder', label: conv.project_id ? 'Move to another project' : 'Add to project', run: () => moveToProject(conv) },
    '-',
    { icon: 'archive', label: 'Archive', run: () => updateChat(conv, { archived: true }, 'Archived. Find it in Archived chats.') },
  ];
  popMenu(anchor, items);
}
async function updateChat(conv, patch, message) {
  try {
    await api(`/api/conversations/${conv.id}`, { method: 'PATCH', body: patch });
    await loadConversations();
    if (patch.archived && location.pathname === `/chat/${conv.id}`) go('/chat', true); else route();
    if (message) toast(message);
  } catch (err) { toast(err.message); }
}
async function moveToProject(conv) {
  if (!state.projects.length) {
    const name = await promptModal({ title: 'New project', label: 'Project name', confirm: 'Create' });
    if (!name) return;
    const p = await api('/api/projects', { method: 'POST', body: { name } });
    await loadProjects();
    return updateChat(conv, { projectId: p.id }, `Moved to ${p.name}`);
  }
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>Move to project</h3>
    <div class="list">${state.projects.map((p) => `<button class="btn" style="justify-content:flex-start;margin-bottom:6px" data-p="${p.id}">${icon('folder')}${esc(p.name)}</button>`).join('')}
    ${conv.project_id ? '<button class="btn" style="justify-content:flex-start;margin-bottom:6px" data-p="">Remove from project</button>' : ''}</div>
    <div class="row" style="margin-top:8px"><button class="btn" data-x>Cancel</button></div></div>`;
  back.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (b) { back.remove(); updateChat(conv, { projectId: b.dataset.p || null }, b.dataset.p ? 'Moved' : 'Removed from project'); }
    if (e.target === back || e.target.closest('[data-x]')) back.remove();
  });
  document.body.appendChild(back);
}
async function changePassword() {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<form class="modal"><h3>Change password</h3>
    <label class="field">Current password<input class="input" name="current" type="password" autocomplete="current-password" required></label>
    <label class="field">New password (12+ characters)<input class="input" name="next" type="password" minlength="12" autocomplete="new-password" required></label>
    <div class="err" role="alert"></div>
    <div class="row"><button type="button" class="btn" data-x>Cancel</button><button class="btn primary">Save</button></div></form>`;
  const f = back.querySelector('form');
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-x]')) back.remove(); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/password', { method: 'POST', body: { current: f.current.value, next: f.next.value } }); back.remove(); toast('Password changed'); }
    catch (err) { f.querySelector('.err').textContent = err.message; }
  });
  document.body.appendChild(back);
}

// ---------- dashboard ----------
const CARD_LABEL = { live: 'Live', pending: 'Pending', needs_source: 'Needs a source', error: 'Needs attention' };
async function pageDashboard(el) {
  const name = (state.me.name || '').split(' ')[0];
  el.innerHTML = `<h1 class="page-title">${name ? `Welcome back, ${esc(name)}` : 'Dashboard'}</h1>
    <p class="page-sub">Here's where things stand. Tap a card to see more.</p>
    <div class="grid">${'<div class="card"><div class="skeleton"></div><div class="skeleton" style="width:50%"></div></div>'.repeat(4)}</div>`;
  try {
    const { cards } = await api('/api/dashboard');
    const order = [...state.settings.dashboard, ...Object.keys(cards).filter((k) => !state.settings.dashboard.includes(k))];
    const html = order.filter((k) => cards[k]).map((k) => {
      const c = cards[k];
      const inner = `<div class="card-title"><span>${esc(c.title)}</span><span class="pill ${c.status}">${CARD_LABEL[c.status] || c.status}</span></div>
        ${c.status === 'needs_source' ? `<div class="card-detail">${esc(c.waiting || 'Connect a source to fill this card.')}</div>` : `<div class="card-value">${esc(c.value ?? '—')}</div>`}
        ${c.detail ? `<div class="card-detail">${esc(c.detail)}</div>` : ''}
        ${c.items ? `<ul class="card-detail" style="margin:0;padding-left:18px">${c.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
        <div class="card-foot"><span>${esc(c.source || '')}</span><span>${c.updatedAt ? 'Updated ' + ago(c.updatedAt) : ''}</span></div>`;
      return c.link ? `<a class="card" href="${esc(c.link)}" data-link>${inner}</a>` : `<div class="card">${inner}</div>`;
    }).join('');
    el.querySelector('.grid').innerHTML = html || '<div class="empty">No cards yet.</div>';
    const recent = state.conversations.filter((c) => !c.archived_at).slice(0, 5);
    el.insertAdjacentHTML('beforeend', `<div class="dash-section"><div class="row spread"><h2>Recent chats</h2><a class="btn sm" href="/chat" data-link>${icon('plus')}New chat</a></div>
      <div class="panel"><div class="list">${recent.map((c) => `<a class="list-item" href="/chat/${c.id}" data-link style="color:inherit;text-decoration:none">${c.starred ? icon('star', 'icon star') : icon('chat')}
      <div class="grow"><div class="title">${esc(c.title)}</div><div class="meta">${ago(c.updated_at)}</div></div></a>`).join('') || `<div class="empty">No chats yet. Ask ${esc(state.settings.brand.agentName)} something to get started.</div>`}</div></div></div>`);
  } catch (err) {
    el.querySelector('.grid').innerHTML = `<div class="empty">Could not load the dashboard: ${esc(err.message)}</div>`;
  }
}

// ---------- chat ----------
async function pageNewChat(el, projectId = null) {
  el.className = 'content chat-content';
  const b = state.settings.brand;
  el.innerHTML = `<div class="thread"><div class="welcome"><div class="logo" style="margin:0 auto;width:48px;height:48px">${esc(b.logoText)}</div>
    <h2>What should ${esc(b.agentName)} work on?</h2><p>Your message goes to your own agent. It answers from your memory and tools.</p></div></div>
    ${composerHtml()}`;
  bindComposer(el, async (text) => {
    const conv = await api('/api/conversations', { method: 'POST', body: { projectId } });
    await sendInChat(conv.id, text);
    await loadConversations();
    go(`/chat/${conv.id}`, true);
  });
}

function composerHtml() {
  return `<div class="composer-wrap"><div class="offline-banner" id="agent-banner" hidden></div>
    <form class="composer" id="composer"><label class="sr" for="msg">Message</label>
    <textarea id="msg" rows="1" placeholder="Message ${esc(state.settings.brand.agentName)}…"></textarea>
    <button class="send" id="send" aria-label="Send" disabled>${icon('send')}</button></form>
    <div class="powered">Powered by <b>Total Recall</b></div></div>`;
}

function bindComposer(el, onSend) {
  const form = el.querySelector('#composer');
  const ta = el.querySelector('#msg');
  const send = el.querySelector('#send');
  const draftKey = `draft:${location.pathname}`;
  ta.value = sessionStorage.getItem(draftKey) || '';
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'; send.disabled = !ta.value.trim() || form.dataset.busy === '1'; };
  ta.addEventListener('input', () => { sessionStorage.setItem(draftKey, ta.value); fit(); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text || form.dataset.busy === '1') return;
    form.dataset.busy = '1';
    fit();
    try {
      await onSend(text);
      sessionStorage.removeItem(draftKey);
      ta.value = '';
    } catch (err) {
      toast(err.message);
    } finally {
      form.dataset.busy = '0';
      fit();
    }
  });
  fit();
  ta.focus();
}

async function sendInChat(conversationId, text) {
  return api(`/api/conversations/${conversationId}/messages`, { method: 'POST', body: { text, requestId: rid() } });
}

async function pageChat(el, id) {
  el.className = 'content chat-content';
  el.innerHTML = `<div class="chat-head"><span class="title">Loading…</span><button class="dots" style="opacity:1;position:static" aria-label="Chat options" aria-haspopup="menu" aria-expanded="false" id="chat-opts">${icon('dots')}</button></div>
    <div class="thread"><div class="thread-inner"><div class="skeleton"></div><div class="skeleton" style="width:70%"></div></div></div>${composerHtml()}`;
  let data;
  try { data = await api(`/api/conversations/${id}`); }
  catch (err) { el.querySelector('.thread-inner').innerHTML = `<div class="empty">${esc(err.status === 404 ? 'This chat does not exist.' : err.message)}</div>`; return; }
  state.chat = { id, ...data, progress: {} };
  el.querySelector('.chat-head .title').textContent = data.conversation.title;
  el.querySelector('#chat-opts').addEventListener('click', (e) => {
    e.stopPropagation();
    const conv = state.conversations.find((c) => c.id === id) || data.conversation;
    chatMenu(e.currentTarget, conv);
  });
  if (data.conversation.archived_at) {
    el.querySelector('.composer-wrap').innerHTML = `<div class="offline-banner">This chat is archived. <button class="btn sm" id="restore">Restore it</button> to keep talking.</div><div class="powered">Powered by <b>Total Recall</b></div>`;
    el.querySelector('#restore').addEventListener('click', () => updateChat(data.conversation, { archived: false }, 'Restored'));
  } else {
    bindComposer(el, async (text) => {
      const r = await sendInChat(id, text);
      state.chat.messages.push(r.userMessage, { ...r.reply, content: '' });
      if (r.title) el.querySelector('.chat-head .title').textContent = r.title;
      renderThread();
      loadConversations().then(renderSidebar);
    });
  }
  renderThread();
  openStream(id);
  checkAgent();
}

async function checkAgent() {
  const banner = document.getElementById('agent-banner');
  if (!banner) return;
  try {
    const c = await api('/api/connections');
    if (c.hermes.state !== 'connected') { banner.hidden = false; banner.textContent = `${c.hermes.detail} Your saved chats still work.`; }
  } catch { /* ignore */ }
}

function openStream(id) {
  if (state.stream) state.stream.close();
  const es = new EventSource(`/api/conversations/${id}/stream`);
  state.stream = es;
  es.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (!state.chat || state.chat.id !== id) return;
    const msg = state.chat.messages.find((m) => m.id === ev.id);
    if (ev.type === 'delta' && msg) { msg.content += ev.delta; delete state.chat.progress[ev.id]; }
    if (ev.type === 'progress') state.chat.progress[ev.id] = ev.label;
    if (ev.type === 'message' && msg) { msg.status = ev.status; if (ev.content != null) msg.content = ev.content; msg.error = ev.error; delete state.chat.progress[ev.id]; }
    if (ev.type === 'approval') {
      const i = state.chat.approvals.findIndex((a) => a.id === ev.approval.id);
      if (i >= 0) state.chat.approvals[i] = ev.approval; else state.chat.approvals.push(ev.approval);
      if (msg && !ev.approval.decision) msg.status = 'waiting';
    }
    if (ev.type === 'title') {
      const t = document.querySelector('.chat-head .title');
      if (t) t.textContent = ev.title;
      loadConversations().then(renderSidebar);
    }
    renderThread();
  };
  // On reconnect, reload from the server so nothing is missed.
  es.onerror = () => { setTimeout(async () => { if (state.chat?.id === id && es.readyState === 2) { const d = await api(`/api/conversations/${id}`); Object.assign(state.chat, d); renderThread(); openStream(id); } }, 3000); };
}

function renderThread() {
  const inner = document.querySelector('.thread');
  if (!inner || !state.chat) return;
  const atBottom = inner.scrollHeight - inner.scrollTop - inner.clientHeight < 80;
  const agent = state.settings.brand;
  const html = state.chat.messages.map((m) => {
    if (m.role === 'user') return `<div class="msg user"><div class="bubble">${esc(m.content)}</div></div>`;
    const approvals = state.chat.approvals.filter((a) => a.message_id === m.id).map(approvalHtml).join('');
    const working = (m.status === 'running') ? `<div class="working"><span class="spinner"></span>${esc(state.chat.progress[m.id] || `${agent.agentName} is working…`)}<button class="btn sm" data-stop="${m.id}" style="margin-left:6px">${icon('stop')}Stop</button></div>` : '';
    const waiting = m.status === 'waiting' ? `<div class="working">Waiting for your decision below.</div>` : '';
    const err = m.status === 'failed' ? `<div class="err">${esc(m.error || 'Something went wrong.')}</div>` : m.status === 'stopped' ? `<div class="working">Stopped.${m.error ? ' ' + esc(m.error) : ''}</div>` : '';
    return `<div class="msg assistant"><div class="agent-dot" title="${esc(agent.agentName)}">${esc((agent.agentName.trim()[0] || 'A').toUpperCase())}</div><div class="bubble"><div class="md">${renderMarkdown(m.content)}</div>${working}${waiting}${approvals}${err}</div></div>`;
  }).join('');
  inner.innerHTML = `<div class="thread-inner">${html || '<div class="empty">Say hello to start.</div>'}</div>`;
  inner.querySelectorAll('[data-stop]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/api/messages/${b.dataset.stop}/stop`, { method: 'POST' }); toast('Stopping…'); } catch (err) { toast(err.message); }
  }));
  inner.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
    b.closest('.approval').querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try { await api(`/api/approvals/${b.dataset.approve}`, { method: 'POST', body: { choice: b.dataset.choice } }); }
    catch (err) { toast(err.message); }
  }));
  if (atBottom) inner.scrollTop = inner.scrollHeight;
}

const CHOICE_LABEL = { once: 'Approve once', session: 'Approve for this chat', always: 'Always allow', deny: 'Deny' };
function approvalHtml(a) {
  const decided = a.decision
    ? `<div class="meta">${a.decision === 'expired' ? 'This request ended before a decision.' : a.decision === 'already settled' ? 'Already decided elsewhere.' : `You chose: ${esc(CHOICE_LABEL[a.decision] || a.decision)}`} ${a.decided_at ? '· ' + ago(a.decided_at) : ''}</div>`
    : `<div class="row">${a.choices.map((c) => `<button class="btn sm ${c === 'deny' ? 'danger' : c === 'once' ? 'primary' : ''}" data-approve="${a.id}" data-choice="${esc(c)}">${esc(CHOICE_LABEL[c] || c)}</button>`).join('')}</div>`;
  return `<div class="approval"><div class="label">Needs your OK</div><pre>${esc(a.summary)}</pre>${decided}</div>`;
}

// ---------- projects ----------
async function pageProjects(el) {
  await loadProjects();
  el.innerHTML = `<div class="row spread"><div><h1 class="page-title">Projects</h1><p class="page-sub">Group related chats so you can find them later.</p></div>
    <button class="btn primary" id="new-project">${icon('plus')}New project</button></div>
    <div class="panel"><div class="list">${state.projects.map((p) => `
      <div class="list-item">${icon('folder')}<a class="grow" href="/projects/${p.id}" data-link style="color:inherit;text-decoration:none"><div class="title">${esc(p.name)}</div>
      <div class="meta">${p.chat_count} chat${p.chat_count === 1 ? '' : 's'} · updated ${ago(p.updated_at)}</div></a>
      <button class="dots" style="opacity:1;position:static" data-pmenu="${p.id}" aria-label="Options for ${esc(p.name)}" aria-haspopup="menu" aria-expanded="false">${icon('dots')}</button></div>`).join('')
      || '<div class="empty">No projects yet. Create one, then add chats to it from the chat menu.</div>'}</div></div>`;
  el.querySelector('#new-project').addEventListener('click', async () => {
    const name = await promptModal({ title: 'New project', label: 'Project name', confirm: 'Create' });
    if (!name) return;
    await api('/api/projects', { method: 'POST', body: { name } });
    route();
  });
  el.querySelectorAll('[data-pmenu]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    projectMenu(b, state.projects.find((p) => p.id === b.dataset.pmenu));
  }));
}
function projectMenu(anchor, p) {
  popMenu(anchor, [
    { icon: 'pencil', label: 'Rename', run: async () => {
      const name = await promptModal({ title: 'Rename project', label: 'Project name', value: p.name });
      if (name) { await api(`/api/projects/${p.id}`, { method: 'PATCH', body: { name } }); await loadProjects(); route(); }
    } },
    { icon: 'trash', label: 'Delete project', danger: true, run: async () => {
      if (!(await confirmModal({ title: 'Delete this project?', body: 'Its chats are kept. They just lose this project label.', confirm: 'Delete project', danger: true }))) return;
      await api(`/api/projects/${p.id}`, { method: 'DELETE' });
      await Promise.all([loadProjects(), loadConversations()]);
      go('/projects');
    } },
  ]);
}
async function pageProject(el, id) {
  await loadProjects();
  const p = state.projects.find((x) => x.id === id);
  if (!p) { el.innerHTML = '<div class="empty">Project not found.</div>'; return; }
  const chats = await api(`/api/conversations?project=${id}`);
  el.innerHTML = `<p class="page-sub" style="margin:0 0 4px"><a href="/projects" data-link>Projects</a></p>
    <div class="row spread"><h1 class="page-title">${esc(p.name)}</h1><div class="row"><button class="btn primary" id="proj-chat">${icon('plus')}New chat here</button>
    <button class="dots" style="opacity:1;position:static" id="proj-menu" aria-label="Project options" aria-haspopup="menu" aria-expanded="false">${icon('dots')}</button></div></div>
    <div class="panel"><div class="list">${chats.map((c) => `<a class="list-item" href="/chat/${c.id}" data-link style="color:inherit;text-decoration:none">${c.starred ? icon('star', 'icon star') : icon('chat')}
      <div class="grow"><div class="title">${esc(c.title)}</div><div class="meta">${ago(c.updated_at)}</div></div></a>`).join('')
      || '<div class="empty">No chats in this project yet.</div>'}</div></div>`;
  el.querySelector('#proj-chat').addEventListener('click', () => { history.pushState({}, '', '/chat'); state.route = 'chat'; renderSidebar(); pageNewChat(el, id); });
  el.querySelector('#proj-menu').addEventListener('click', (e) => { e.stopPropagation(); projectMenu(e.currentTarget, p); });
}

// ---------- archive ----------
async function pageArchive(el) {
  const rows = await api('/api/conversations?archived=1');
  el.innerHTML = `<h1 class="page-title">Archived chats</h1><p class="page-sub">Archived chats are hidden from your sidebar. Restore one, or delete it forever.</p>
    <div class="panel"><div class="list">${rows.map((c) => `<div class="list-item">${icon('archive')}
      <a class="grow" href="/chat/${c.id}" data-link style="color:inherit;text-decoration:none"><div class="title">${esc(c.title)}</div><div class="meta">Archived ${ago(c.archived_at)}</div></a>
      <button class="btn sm" data-restore="${c.id}">${icon('restore')}Restore</button>
      <button class="btn sm danger" data-delete="${c.id}">${icon('trash')}Delete</button></div>`).join('')
      || '<div class="empty">Nothing archived.</div>'}</div></div>`;
  el.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', async () => {
    await api(`/api/conversations/${b.dataset.restore}`, { method: 'PATCH', body: { archived: false } });
    await loadConversations(); route(); toast('Restored');
  }));
  el.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmModal({ title: 'Delete forever?', body: 'This removes the chat and its messages from this app. It cannot be undone.', confirm: 'Delete forever', danger: true }))) return;
    await api(`/api/conversations/${b.dataset.delete}`, { method: 'DELETE' });
    route(); toast('Deleted');
  }));
}

// ---------- library ----------
async function pageLibrary(el) {
  el.innerHTML = `<h1 class="page-title">Library</h1><p class="page-sub">Search what your agent's memory knows. Every result links back to its source.</p>
    <form class="row" id="lib" style="margin-bottom:16px"><input class="input" name="q" placeholder="Search your library" style="flex:1" required><button class="btn primary">Search</button></form>
    <div id="lib-results"></div>`;
  const out = el.querySelector('#lib-results');
  const first = await api('/api/library/search?q=');
  if (first.status.state !== 'connected') out.innerHTML = `<div class="panel"><span class="pill needs_source">Needs a source</span><p>${esc(first.status.detail)}</p></div>`;
  el.querySelector('#lib').addEventListener('submit', async (e) => {
    e.preventDefault();
    out.innerHTML = '<div class="skeleton"></div><div class="skeleton" style="width:60%"></div>';
    try {
      const r = await api(`/api/library/search?q=${encodeURIComponent(e.target.q.value)}`);
      out.innerHTML = r.results.length ? `<div class="panel"><div class="list">${r.results.map((x) => `<div class="list-item"><div class="grow">
        <div class="title">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title)}</div>
        <div class="meta">${x.date ? esc(new Date(x.date).toLocaleDateString()) + ' · ' : ''}${esc(x.snippet)}</div></div></div>`).join('')}</div></div>`
        : `<div class="empty">${r.status.state === 'connected' ? 'No matches.' : esc(r.status.detail)}</div>`;
    } catch (err) { out.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  });
}

// ---------- texts ----------
async function pageTexts(el, peer) {
  const data = await api('/api/texts');
  const st = data.status;
  el.innerHTML = `<div class="row spread"><div><h1 class="page-title">Texts</h1><p class="page-sub">Your business texting line. <span class="pill ${st.state}">${esc(st.state.replace('_', ' '))}</span> ${esc(st.detail)}</p></div>
    <button class="btn" id="new-text" ${st.state === 'connected' ? '' : 'disabled'}>${icon('plus')}New text</button></div>
    <div class="texts"><div class="panel"><div class="list">${data.threads.map((t) => `<a class="list-item" href="/texts/${encodeURIComponent(t.peer)}" data-link style="color:inherit;text-decoration:none">
      ${icon('phone')}<div class="grow"><div class="title">${esc(t.peer)}${t.unread ? ` <span class="pill live">${t.unread} new</span>` : ''}${t.opted_out ? ' <span class="pill error">STOP</span>' : ''}</div>
      <div class="meta">${esc(t.body.slice(0, 60))} · ${ago(t.created_at)}</div></div></a>`).join('') || '<div class="empty">No texts yet.</div>'}</div></div>
    <div class="panel" id="thread-pane"><div class="empty">${st.state === 'not_connected' ? 'Connect your Telnyx number on the Connections page.' : 'Pick a conversation.'}</div></div></div>`;
  el.querySelector('#new-text').addEventListener('click', async () => {
    const to = await promptModal({ title: 'New text', label: 'Number (like +15551234567)', confirm: 'Next' });
    if (to) go(`/texts/${encodeURIComponent(to)}`);
  });
  if (peer) openTextThread(el.querySelector('#thread-pane'), peer);
}
async function openTextThread(pane, peer) {
  const t = await api(`/api/texts/${encodeURIComponent(peer)}`);
  const canSend = t.status.state === 'connected' && !t.optedOut;
  pane.innerHTML = `<h3>${esc(peer)}</h3>
    <div style="margin:10px 0">${t.messages.map((m) => `<div class="sms ${m.direction}">${esc(m.body)}<div class="meta">${ago(m.created_at)}${m.direction === 'outbound' ? ' · ' + esc(m.status.replace(/_/g, ' ')) : ''}${m.error ? ' · ' + esc(m.error) : ''}</div></div>`).join('') || '<div class="empty">No messages yet.</div>'}</div>
    ${t.optedOut ? '<p class="err">This person texted STOP. You can text them again only after they text START.</p>' : ''}
    <form id="sms-form"><textarea class="input" name="text" maxlength="1600" placeholder="${canSend ? 'Write a text…' : 'Sending is off.'}" ${canSend ? '' : 'disabled'} style="min-height:80px;width:100%"></textarea>
    <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn primary" ${canSend ? '' : 'disabled'}>Review and send</button></div></form>`;
  pane.querySelector('#sms-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = e.target.text.value.trim();
    if (!text) return;
    // Every send from the app shows the exact recipient and words first.
    if (!(await confirmModal({ title: `Send to ${peer}?`, body: text, confirm: 'Send text' }))) return;
    try { await api('/api/texts', { method: 'POST', body: { to: peer, text, requestId: rid() } }); toast('Sent to Telnyx'); openTextThread(pane, peer); }
    catch (err) { toast(err.message); }
  });
}

// ---------- connections ----------
const STATE_LABEL = { connected: 'Connected', pending: 'Pending', not_connected: 'Not connected', needs_attention: 'Needs attention', offline: 'Offline', needs_reconnect: 'Reconnect' };
async function pageConnections(el) {
  el.innerHTML = '<h1 class="page-title">Connections</h1><p class="page-sub">Checking…</p>';
  const c = await api('/api/connections');
  const block = (title, s, extra = '') => `<div class="panel"><div class="row spread"><h3>${title}</h3><span class="pill ${s.state}">${STATE_LABEL[s.state] || s.state}</span></div><p class="page-sub" style="margin:4px 0 0">${esc(s.detail)}</p>${extra}</div>`;
  const apps = c.composio.state !== 'connected' ? '' : `
    <div class="list" style="margin-top:10px">${c.apps.map((a) => `<div class="list-item">${icon('plug')}<div class="grow"><div class="title">${esc(a.app)}</div><div class="meta">${a.updatedAt ? 'Updated ' + ago(a.updatedAt) : ''}</div></div><span class="pill ${a.state}">${STATE_LABEL[a.state] || a.state}</span></div>`).join('') || '<div class="empty">No apps linked yet.</div>'}</div>
    ${c.appsError ? `<p class="err">${esc(c.appsError)}</p>` : ''}
    <form class="row" id="link-app" style="margin-top:12px"><input class="input" name="app" placeholder="App name, like gmail or googlecalendar" style="flex:1" pattern="[a-z0-9_]+" required><button class="btn primary">Connect app</button></form>`;
  el.innerHTML = `<h1 class="page-title">Connections</h1><p class="page-sub">What your agent and this app are connected to. Checked ${ago(c.checkedAt)}.</p>
    ${block('Your agent (Hermes)', c.hermes)}
    ${block('Library (memory service)', c.library)}
    ${block('Texting (Telnyx)', c.telnyx, c.telnyx.state !== 'not_connected' ? `<p class="meta" style="margin-top:8px">Webhook URL for your Telnyx messaging profile: <code>${esc(location.origin)}/webhooks/telnyx</code></p>` : '')}
    ${block('Apps (Composio)', c.composio, apps)}`;
  el.querySelector('#link-app')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/connections/composio/link', { method: 'POST', body: { app: e.target.app.value.trim().toLowerCase() } });
      window.open(r.url, '_blank', 'noopener');
      toast('Finish signing in on the page that opened, then come back.');
    } catch (err) { toast(err.message); }
  });
}

// ---------- settings ----------
async function pageSettings(el) {
  const s = structuredClone(state.settings);
  const b = s.brand;
  const draw = () => {
    el.innerHTML = `<h1 class="page-title">Settings</h1><p class="page-sub">Make it yours. Saved to your account, so it survives reloads and redeploys.</p>
    <form class="panel" id="brand"><h3>Name and look</h3><br>
      <label class="field">App name<input class="input" name="appName" maxlength="60" value="${esc(b.appName)}"></label>
      <label class="field">Agent name<input class="input" name="agentName" maxlength="40" value="${esc(b.agentName)}"></label>
      <label class="field">Logo letters (up to 3)<input class="input" name="logoText" maxlength="3" value="${esc(b.logoText)}"></label>
      <label class="field">Accent colour<input class="input" name="accent" type="color" value="${esc(b.accent)}" style="width:90px;padding:4px"></label>
      <label class="field">Theme<select class="input" name="theme">${['system', 'light', 'dark'].map((t) => `<option ${b.theme === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field">Time zone<input class="input" name="timeZone" value="${esc(b.timeZone)}"></label>
      <label class="field">Home page<select class="input" name="home">${s.menu.map((m) => `<option value="${m.key}" ${s.home === m.key ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select></label>
      <button class="btn primary">Save</button></form>
    <div class="panel"><h3>Menu</h3><p class="page-sub">Rename, reorder or hide pages. Add your own pages and links.</p>
      <div class="list">${s.menu.map((m, i) => `<div class="list-item">${icon(m.icon)}<input class="input" data-title="${i}" value="${esc(m.title)}" style="flex:1;min-width:120px">
        <button class="btn sm" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button class="btn sm" data-down="${i}" ${i === s.menu.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
        <label class="row" style="font-size:13px"><input type="checkbox" data-hide="${i}" ${m.hidden ? 'checked' : ''}>Hide</label>
        ${s.customPages.some((p) => p.key === m.key) ? `<button class="btn sm danger" data-remove="${m.key}">Remove</button>` : ''}</div>`).join('')}</div>
      <div class="row" style="margin-top:12px"><button class="btn" id="add-page">${icon('plus')}Add a page</button><button class="btn" id="add-link">${icon('link')}Add a link</button><button class="btn primary" id="save-menu">Save menu</button></div></div>`;
    el.querySelector('#brand').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      Object.assign(b, { appName: f.appName.value, agentName: f.agentName.value, logoText: f.logoText.value, accent: f.accent.value, theme: f.theme.value, timeZone: f.timeZone.value });
      s.home = f.home.value;
      await save({ brand: b, home: s.home });
    });
    el.querySelectorAll('[data-title]').forEach((inp) => inp.addEventListener('input', () => { s.menu[inp.dataset.title].title = inp.value; }));
    el.querySelectorAll('[data-hide]').forEach((c) => c.addEventListener('change', () => { s.menu[c.dataset.hide].hidden = c.checked; }));
    el.querySelectorAll('[data-up]').forEach((x) => x.addEventListener('click', () => { const i = +x.dataset.up; [s.menu[i - 1], s.menu[i]] = [s.menu[i], s.menu[i - 1]]; draw(); }));
    el.querySelectorAll('[data-down]').forEach((x) => x.addEventListener('click', () => { const i = +x.dataset.down; [s.menu[i + 1], s.menu[i]] = [s.menu[i], s.menu[i + 1]]; draw(); }));
    el.querySelectorAll('[data-remove]').forEach((x) => x.addEventListener('click', () => { s.customPages = s.customPages.filter((p) => p.key !== x.dataset.remove); s.menu = s.menu.filter((m) => m.key !== x.dataset.remove); draw(); }));
    el.querySelector('#add-page').addEventListener('click', async () => {
      const title = await promptModal({ title: 'Add a page', label: 'Page name', confirm: 'Add' });
      if (!title) return;
      const key = 'page-' + Date.now().toString(36);
      s.customPages.push({ key, title, icon: 'page', kind: 'note', body: `# ${title}\n\nWrite anything here. Markdown works.` });
      s.menu.push({ key, title, icon: 'page', hidden: false });
      draw();
    });
    el.querySelector('#add-link').addEventListener('click', async () => {
      const title = await promptModal({ title: 'Add a link', label: 'Link name', confirm: 'Next' });
      if (!title) return;
      const url = await promptModal({ title: 'Add a link', label: 'Web address (https://…)', confirm: 'Add' });
      if (!url) return;
      const key = 'link-' + Date.now().toString(36);
      s.customPages.push({ key, title, icon: 'link', kind: 'link', url });
      s.menu.push({ key, title, icon: 'link', hidden: false });
      draw();
    });
    el.querySelector('#save-menu').addEventListener('click', () => save({ menu: s.menu, customPages: s.customPages }));
  };
  const save = async (patch) => {
    try {
      const r = await api('/api/settings', { method: 'PUT', body: patch });
      state.settings = r.settings;
      Object.assign(s, structuredClone(r.settings));
      applyBrand();
      renderShell();
      draw();
      toast('Saved');
    } catch (err) { toast(err.message); }
  };
  draw();
}

// ---------- custom pages ----------
function pageCustom(el, key) {
  const p = state.settings.customPages.find((x) => x.key === key && x.kind === 'note');
  if (!p) { el.innerHTML = '<div class="empty">Page not found.</div>'; return; }
  el.innerHTML = `<div class="row spread"><h1 class="page-title">${esc(p.title)}</h1><button class="btn sm" id="edit">${icon('pencil')}Edit</button></div><div class="panel md">${renderMarkdown(p.body || '')}</div>`;
  el.querySelector('#edit').addEventListener('click', () => {
    el.innerHTML = `<h1 class="page-title">${esc(p.title)}</h1><textarea class="input" id="body" style="width:100%;min-height:50vh">${esc(p.body || '')}</textarea>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="save">Save</button><button class="btn" id="cancel">Cancel</button></div>`;
    el.querySelector('#cancel').addEventListener('click', () => route());
    el.querySelector('#save').addEventListener('click', async () => {
      const pages = state.settings.customPages.map((x) => x.key === key ? { ...x, body: el.querySelector('#body').value } : x);
      const r = await api('/api/settings', { method: 'PUT', body: { customPages: pages } });
      state.settings = r.settings;
      route();
      toast('Saved');
    });
  });
}

boot();
