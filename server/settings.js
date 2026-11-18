import { one, q } from './db.js';

// Everything a student customises lives here, saved per owner in the settings table.
// Code never hard-codes a person's name, business or agent.
export const BUILT_IN_PAGES = [
  { key: 'dashboard', title: 'Dashboard', icon: 'grid' },
  { key: 'chat', title: 'Chat', icon: 'chat' },
  { key: 'projects', title: 'Projects', icon: 'folder' },
  { key: 'library', title: 'Library', icon: 'book' },
  { key: 'texts', title: 'Texts', icon: 'phone' },
  { key: 'connections', title: 'Connections', icon: 'plug' },
];

export const DEFAULT_SETTINGS = {
  brand: {
    appName: 'My Total Recall',
    agentName: 'My Agent',
    accent: '#1D9BF0',
    logoText: 'TR',
    theme: 'system', // light | dark | system
    timeZone: 'America/New_York',
  },
  home: 'dashboard',
  // Order and visibility of the sidebar menu. Custom pages are added here too.
  menu: BUILT_IN_PAGES.map((p) => ({ key: p.key, title: p.title, icon: p.icon, hidden: false })),
  // Custom pages: { key, title, icon, kind: 'note' | 'link', body?, url? }
  customPages: [],
  // Which dashboard cards show, in order. App cards are built in; agent cards arrive by snapshot.
  dashboard: ['chats_week', 'texts_waiting', 'agent_status', 'projects', 'connections'],
};

function merge(saved) {
  const s = saved || {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    brand: { ...DEFAULT_SETTINGS.brand, ...(s.brand || {}) },
    menu: Array.isArray(s.menu) ? s.menu : DEFAULT_SETTINGS.menu,
    customPages: Array.isArray(s.customPages) ? s.customPages : [],
    dashboard: Array.isArray(s.dashboard) ? s.dashboard : DEFAULT_SETTINGS.dashboard,
  };
}

export async function getSettings(userId) {
  const row = await one('SELECT data FROM settings WHERE user_id = $1', [userId]);
  return merge(row?.data);
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const KEY = /^[a-z0-9_-]{1,40}$/;
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

/** Validates a settings update. Unknown fields are dropped. */
export function sanitizeSettings(input, current) {
  const next = merge(current);
  if (input.brand && typeof input.brand === 'object') {
    const b = input.brand;
    if (b.appName !== undefined) next.brand.appName = clean(b.appName, 60) || DEFAULT_SETTINGS.brand.appName;
    if (b.agentName !== undefined) next.brand.agentName = clean(b.agentName, 40) || DEFAULT_SETTINGS.brand.agentName;
    if (b.logoText !== undefined) next.brand.logoText = clean(b.logoText, 3) || 'TR';
    if (b.accent !== undefined && HEX.test(b.accent)) next.brand.accent = b.accent;
    if (['light', 'dark', 'system'].includes(b.theme)) next.brand.theme = b.theme;
    if (b.timeZone !== undefined) {
      try { new Intl.DateTimeFormat('en-US', { timeZone: b.timeZone }); next.brand.timeZone = b.timeZone; } catch { /* keep */ }
    }
  }
  if (Array.isArray(input.customPages)) {
    next.customPages = input.customPages.slice(0, 20).filter((p) => KEY.test(p?.key) && !BUILT_IN_PAGES.some((b) => b.key === p.key)).map((p) => {
      const page = { key: p.key, title: clean(p.title, 40) || 'Untitled', icon: clean(p.icon, 20) || 'page', kind: p.kind === 'link' ? 'link' : 'note' };
      if (page.kind === 'link') {
        try { const u = new URL(p.url); if (u.protocol === 'https:') page.url = u.toString(); } catch { /* invalid */ }
        if (!page.url) page.kind = 'note';
      }
      if (page.kind === 'note') page.body = clean(p.body, 20000);
      return page;
    });
  }
  const knownKeys = new Set([...BUILT_IN_PAGES.map((p) => p.key), ...next.customPages.map((p) => p.key)]);
  if (Array.isArray(input.menu)) {
    const seen = new Set();
    next.menu = input.menu.filter((m) => knownKeys.has(m?.key) && !seen.has(m.key) && seen.add(m.key)).map((m) => ({
      key: m.key, title: clean(m.title, 40) || m.key, icon: clean(m.icon, 20) || 'page', hidden: Boolean(m.hidden),
    }));
  }
  // Every known page appears in the menu exactly once; new custom pages go to the end.
  for (const k of knownKeys) if (!next.menu.some((m) => m.key === k)) {
    const p = BUILT_IN_PAGES.find((b) => b.key === k) || next.customPages.find((c) => c.key === k);
    next.menu.push({ key: k, title: p.title, icon: p.icon, hidden: false });
  }
  next.menu = next.menu.filter((m) => knownKeys.has(m.key));
  if (typeof input.home === 'string' && knownKeys.has(input.home)) next.home = input.home;
  if (Array.isArray(input.dashboard)) next.dashboard = input.dashboard.filter((k) => KEY.test(k)).slice(0, 12);
  return next;
}

export async function saveSettings(userId, data) {
  await q(`INSERT INTO settings (user_id, data, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [userId, data]);
}
