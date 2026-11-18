// Connect apps (Gmail, Calendar, Drive, Slack, CRMs ...) through YOUR Composio project.
// Docs: https://docs.composio.dev/reference/api-reference/connected-accounts/getConnectedAccounts
//       https://docs.composio.dev/reference/api-reference/connected-accounts/postConnectedAccountsLink
// One Composio user id per app owner (COMPOSIO_USER_ID). No fallback to anyone else's id.
// Your Hermes uses the same user id through its own Composio connection, so apps linked here
// are the apps your agent can use.
const BASE = 'https://backend.composio.dev/api/v3.1';

export function composioStatus() {
  if (!process.env.COMPOSIO_API_KEY) return { state: 'not_connected', detail: 'Add COMPOSIO_API_KEY to connect apps.' };
  if (!process.env.COMPOSIO_USER_ID) return { state: 'needs_attention', detail: 'Set COMPOSIO_USER_ID (the same id your Hermes uses).' };
  return { state: 'connected', detail: `Composio user ${process.env.COMPOSIO_USER_ID}` };
}

async function api(method, path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'x-api-key': process.env.COMPOSIO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json?.error?.message || `Composio request failed (HTTP ${res.status}).`);
      err.status = res.status;
      throw err;
    }
    return json;
  } finally { clearTimeout(timer); }
}

const state = (s, disabled) => disabled ? 'needs_reconnect' : s === 'ACTIVE' ? 'connected' : ['INITIATED', 'INITIALIZING'].includes(s) ? 'pending' : 'needs_reconnect';

export async function listConnections() {
  const userId = process.env.COMPOSIO_USER_ID;
  const params = new URLSearchParams({ limit: '100', order_by: 'updated_at', order_direction: 'desc' });
  params.append('user_ids', userId);
  const json = await api('GET', `/connected_accounts?${params}`);
  return (json.items || []).map((i) => ({
    id: i.id,
    app: i.toolkit?.slug || 'unknown',
    state: state(String(i.status || '').toUpperCase(), i.is_disabled === true),
    updatedAt: i.updated_at || i.created_at || null,
  }));
}

/** Starts a hosted sign-in link for one app. Returns the https URL to open. */
export async function startLink(appSlug, callbackUrl) {
  if (!/^[a-z0-9_]{1,80}$/.test(appSlug)) throw Object.assign(new Error('Choose a valid app.'), { status: 400 });
  // Use an existing auth config for this app, or create a Composio-managed one.
  const configs = await api('GET', `/auth_configs?toolkit_slug=${encodeURIComponent(appSlug)}&limit=5`);
  let authConfigId = (configs.items || []).find((c) => c.status === 'ENABLED' || !c.status)?.id;
  if (!authConfigId) {
    const created = await api('POST', '/auth_configs', { toolkit: { slug: appSlug }, auth_config: { type: 'use_composio_managed_auth' } });
    authConfigId = created?.auth_config?.id;
  }
  if (!authConfigId) throw Object.assign(new Error('Composio has no sign-in setup for this app yet.'), { status: 400 });
  const link = await api('POST', '/connected_accounts/link', {
    auth_config_id: authConfigId,
    user_id: process.env.COMPOSIO_USER_ID,
    callback_url: callbackUrl,
  });
  const url = new URL(link.redirect_url);
  if (url.protocol !== 'https:') throw Object.assign(new Error('Composio returned an unsafe link.'), { status: 502 });
  return { url: url.toString(), expiresAt: link.expires_at || null };
}
