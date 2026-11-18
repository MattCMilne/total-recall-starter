import express from 'express';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pool, migrate, one, many, q, audit } from './db.js';
import { loadUser, requireUser, sameOrigin, rateLimit, verifyPassword, hashPassword, startSession, endSession } from './auth.js';
import { getSettings, sanitizeSettings, saveSettings, BUILT_IN_PAGES } from './settings.js';
import { hermesStatus } from './hermes.js';
import { sendMessage, subscribe, decideApproval, stopReply, resumeOpenRuns } from './chat.js';
import { telnyxStatus, verifySignature, handleWebhook, sendText } from './telnyx.js';
import { composioStatus, listConnections, startLink } from './composio.js';
import { libraryStatus, searchLibrary } from './library.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SECURE = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");
  next();
});

// Telnyx webhook needs the raw body for its signature, so it is mounted before the JSON parser.
app.post('/webhooks/telnyx', express.text({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const ok = verifySignature(req.body, req.get('telnyx-signature-ed25519'), req.get('telnyx-timestamp'));
  if (!ok) return res.status(401).json({ error: 'bad signature' });
  try {
    const owner = await ownerAccount();
    if (!owner) return res.status(503).json({ error: 'no owner account yet' });
    const result = await handleWebhook(owner.id, JSON.parse(req.body));
    res.json({ ok: true, result });
  } catch (err) {
    console.error('[telnyx] webhook error:', err.message);
    res.status(500).json({ error: 'could not save event' }); // Telnyx retries
  }
});

app.use(express.json({ limit: '256kb' }));
app.use(loadUser);
app.use('/api', sameOrigin);

async function ownerAccount() {
  if (process.env.OWNER_EMAIL) return one('SELECT id FROM users WHERE lower(email) = lower($1)', [process.env.OWNER_EMAIL]);
  return one('SELECT id FROM users ORDER BY created_at LIMIT 1');
}

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const isUuid = (v) => /^[0-9a-f-]{36}$/i.test(String(v || ''));

// ---------- health ----------
app.get('/healthz', wrap(async (_req, res) => {
  await q('SELECT 1');
  res.json({ ok: true });
}));

// ---------- auth ----------
app.post('/api/login', rateLimit({ windowMs: 60_000, max: 8 }), wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await one('SELECT * FROM users WHERE lower(email) = lower($1)', [String(email || '')]);
  if (!user || !(await verifyPassword(String(password || ''), user.password_hash))) {
    return res.status(401).json({ error: 'Email or password is wrong.' });
  }
  await startSession(res, user.id, SECURE);
  await audit(user.id, 'login');
  res.json({ ok: true });
}));

app.post('/api/logout', wrap(async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
}));

app.post('/api/password', requireUser, rateLimit({ windowMs: 60_000, max: 5 }), wrap(async (req, res) => {
  const { current, next } = req.body || {};
  const user = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await verifyPassword(String(current || ''), user.password_hash))) return res.status(400).json({ error: 'Current password is wrong.' });
  if (String(next || '').length < 12) return res.status(400).json({ error: 'Use at least 12 characters.' });
  await q('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await hashPassword(next)]);
  await audit(req.user.id, 'password.change');
  res.json({ ok: true });
}));

// ---------- me + settings ----------
app.get('/api/me', wrap(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  res.json({ user: req.user, settings: await getSettings(req.user.id), builtIns: BUILT_IN_PAGES });
}));

app.put('/api/settings', requireUser, wrap(async (req, res) => {
  const current = await getSettings(req.user.id);
  const next = sanitizeSettings(req.body || {}, current);
  await saveSettings(req.user.id, next);
  res.json({ settings: next });
}));

// ---------- projects ----------
app.get('/api/projects', requireUser, wrap(async (req, res) => {
  res.json(await many(
    `SELECT p.*, (SELECT count(*)::int FROM conversations c WHERE c.project_id = p.id AND c.archived_at IS NULL) AS chat_count
     FROM projects p WHERE p.user_id = $1 ORDER BY p.updated_at DESC`, [req.user.id]));
}));

app.post('/api/projects', requireUser, wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'Give the project a name.' });
  res.status(201).json(await one(
    `INSERT INTO projects (user_id, name, description) VALUES ($1, $2, $3) RETURNING *`,
    [req.user.id, name, String(req.body?.description || '').slice(0, 2000)]));
}));

app.patch('/api/projects/:id', requireUser, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 120) : null;
  if (name === '') return res.status(400).json({ error: 'Name cannot be empty.' });
  const row = await one(
    `UPDATE projects SET name = COALESCE($3, name), description = COALESCE($4, description), updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.id, req.user.id, name, req.body?.description !== undefined ? String(req.body.description).slice(0, 2000) : null]);
  row ? res.json(row) : res.status(404).json({ error: 'Not found.' });
}));

// Deleting a project keeps its chats. They just lose the project label.
app.delete('/api/projects/:id', requireUser, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const row = await one('DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
  row ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found.' });
}));

// ---------- conversations ----------
app.get('/api/conversations', requireUser, wrap(async (req, res) => {
  const archived = req.query.archived === '1';
  const project = isUuid(req.query.project) ? req.query.project : null;
  res.json(await many(
    `SELECT id, title, starred, project_id, archived_at, created_at, updated_at FROM conversations
     WHERE user_id = $1 AND (archived_at IS NOT NULL) = $2 AND ($3::uuid IS NULL OR project_id = $3)
     ORDER BY ${archived ? 'archived_at DESC' : 'starred DESC, updated_at DESC'} LIMIT 200`,
    [req.user.id, archived, project]));
}));

app.post('/api/conversations', requireUser, wrap(async (req, res) => {
  const project = isUuid(req.body?.projectId) ? req.body.projectId : null;
  if (project && !(await one('SELECT 1 FROM projects WHERE id = $1 AND user_id = $2', [project, req.user.id]))) {
    return res.status(404).json({ error: 'Project not found.' });
  }
  res.status(201).json(await one(
    `INSERT INTO conversations (user_id, project_id, hermes_session_id) VALUES ($1, $2, $3) RETURNING *`,
    [req.user.id, project, `tr-app-${crypto.randomUUID()}`]));
}));

app.get('/api/conversations/:id', requireUser, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const conv = await one('SELECT * FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!conv) return res.status(404).json({ error: 'Chat not found.' });
  const messages = await many('SELECT id, role, content, status, error, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at', [conv.id]);
  const approvals = await many(
    `SELECT a.id, a.message_id, a.summary, a.choices, a.decision, a.decided_at FROM approvals a
     JOIN messages m ON m.id = a.message_id WHERE m.conversation_id = $1 ORDER BY a.created_at`, [conv.id]);
  delete conv.hermes_session_id;
  res.json({ conversation: conv, messages, approvals });
}));

// Star, rename, move to a project, archive, restore.
app.patch('/api/conversations/:id', requireUser, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const b = req.body || {};
  const conv = await one('SELECT * FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!conv) return res.status(404).json({ error: 'Chat not found.' });
  if (b.projectId && !(isUuid(b.projectId) && await one('SELECT 1 FROM projects WHERE id = $1 AND user_id = $2', [b.projectId, req.user.id]))) {
    return res.status(404).json({ error: 'Project not found.' });
  }
  const title = b.title !== undefined ? String(b.title).trim().slice(0, 120) : null;
  if (title === '') return res.status(400).json({ error: 'Name cannot be empty.' });
  const row = await one(
    `UPDATE conversations SET
       title = COALESCE($3, title),
       title_set_by_owner = title_set_by_owner OR $3 IS NOT NULL,
       starred = COALESCE($4, starred),
       project_id = CASE WHEN $5 THEN $6::uuid ELSE project_id END,
       archived_at = CASE WHEN $7::boolean IS NULL THEN archived_at WHEN $7 THEN now() ELSE NULL END
     WHERE id = $1 AND user_id = $2 RETURNING id, title, starred, project_id, archived_at, updated_at`,
    [conv.id, req.user.id, title, typeof b.starred === 'boolean' ? b.starred : null,
      'projectId' in b, b.projectId || null, typeof b.archived === 'boolean' ? b.archived : null]);
  if (typeof b.archived === 'boolean') await audit(req.user.id, b.archived ? 'chat.archive' : 'chat.restore', conv.id);
  res.json(row);
}));

// Delete forever. Only allowed from the archive, so a chat is always archived first.
app.delete('/api/conversations/:id', requireUser, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const row = await one(
    `DELETE FROM conversations WHERE id = $1 AND user_id = $2 AND archived_at IS NOT NULL RETURNING id`, [req.params.id, req.user.id]);
  if (!row) return res.status(409).json({ error: 'Archive the chat first. Delete lives in Archived chats.' });
  await audit(req.user.id, 'chat.delete', row.id);
  res.json({ ok: true });
}));

app.post('/api/conversations/:id/messages', requireUser, rateLimit({ windowMs: 60_000, max: 30 }), wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Write a message first.' });
  if (text.length > 32000) return res.status(400).json({ error: 'Messages can be up to 32,000 characters.' });
  const r = await sendMessage(req.user, req.params.id, text, req.body?.requestId);
  res.status(r.status).json(r.body);
}));

// Live updates for one chat (Server-Sent Events). The browser reconnects automatically.
app.get('/api/conversations/:id/stream', requireUser, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).end();
  const conv = await one('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!conv) return res.status(404).end();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(': open\n\n');
  const off = subscribe(conv.id, (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`));
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { off(); clearInterval(ping); });
}));

app.post('/api/messages/:id/stop', requireUser, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const r = await stopReply(req.user, req.params.id);
  res.status(r.status).json(r.body);
}));

app.post('/api/approvals/:id', requireUser, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const r = await decideApproval(req.user, req.params.id, String(req.body?.choice || ''));
  res.status(r.status).json(r.body);
}));

// ---------- dashboard ----------
// App cards are computed from your own records. Agent cards arrive by snapshot (below).
app.get('/api/dashboard', requireUser, wrap(async (req, res) => {
  const uid = req.user.id;
  const [chats, texts, projects, agentCards, hermes] = await Promise.all([
    one(`SELECT count(*)::int AS n, max(updated_at) AS at FROM conversations WHERE user_id = $1 AND archived_at IS NULL AND updated_at > now() - interval '7 days'`, [uid]),
    one(`SELECT count(DISTINCT peer)::int AS n, max(created_at) AS at FROM sms_messages WHERE user_id = $1 AND direction = 'inbound' AND read_at IS NULL`, [uid]),
    one(`SELECT count(*)::int AS n, max(updated_at) AS at FROM projects WHERE user_id = $1`, [uid]),
    many(`SELECT key, data, received_at FROM dashboard_cards WHERE user_id = $1`, [uid]),
    hermesStatus(),
  ]);
  const tel = telnyxStatus();
  const comp = composioStatus();
  const now = new Date().toISOString();
  const cards = {
    chats_week: { title: 'Chats this week', value: chats.n, source: 'Your chats', updatedAt: chats.at || now, status: 'live', link: '/chat' },
    texts_waiting: tel.state === 'not_connected'
      ? { title: 'Texts waiting', status: 'needs_source', waiting: 'Connect your Telnyx number to see unread texts here.', source: 'Telnyx', link: '/connections' }
      : { title: 'Texts waiting', value: texts.n, source: 'Your text inbox', updatedAt: texts.at || now, status: 'live', link: '/texts' },
    agent_status: { title: 'Your agent', value: hermes.state === 'connected' ? 'Online' : hermes.state === 'offline' ? 'Offline' : 'Needs setup', detail: hermes.state === 'connected' ? null : hermes.detail, source: 'Your Hermes', updatedAt: now, status: hermes.state === 'connected' ? 'live' : 'error', link: '/connections' },
    projects: { title: 'Projects', value: projects.n, source: 'Your projects', updatedAt: projects.at || now, status: 'live', link: '/projects' },
    connections: { title: 'Connections', value: [hermes.state, tel.state, comp.state].filter((s) => s === 'connected').length + ' of 3', source: 'Agent, texting, apps', updatedAt: now, status: 'live', link: '/connections' },
  };
  for (const c of agentCards) cards[c.key] = { ...c.data, updatedAt: c.data.updatedAt || c.received_at, status: c.data.status || 'live', fromAgent: true };
  res.json({ cards });
}));

// Your agent posts a card here on a schedule. The key decides whose dashboard it is: there is no user field.
app.post('/agent/dashboard', express.json({ limit: '32kb' }), wrap(async (req, res) => {
  const expected = process.env.DASHBOARD_PUSH_KEY || '';
  const got = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return res.status(401).json({ error: 'bad key' });
  }
  const owner = await ownerAccount();
  if (!owner) return res.status(503).json({ error: 'no owner account yet' });
  const cards = Array.isArray(req.body?.cards) ? req.body.cards.slice(0, 12) : [];
  const SECRETISH = /(sk-[A-Za-z0-9]{10,}|xox[abp]-|AKIA[0-9A-Z]{12}|-----BEGIN|Bearer\s+[A-Za-z0-9._-]{20,})/;
  let saved = 0;
  for (const c of cards) {
    if (!/^[a-z0-9_-]{1,40}$/.test(c?.key || '') || !c.title) continue;
    const data = {
      title: String(c.title).slice(0, 60),
      value: c.value === undefined ? null : String(c.value).slice(0, 80),
      detail: c.detail ? String(c.detail).slice(0, 400) : null,
      items: Array.isArray(c.items) ? c.items.slice(0, 8).map((i) => String(i).slice(0, 160)) : undefined,
      source: String(c.source || 'Your agent').slice(0, 80),
      status: ['live', 'pending', 'needs_source', 'error'].includes(c.status) ? c.status : 'live',
      updatedAt: c.updatedAt && !isNaN(Date.parse(c.updatedAt)) ? new Date(c.updatedAt).toISOString() : new Date().toISOString(),
    };
    if (SECRETISH.test(JSON.stringify(data))) continue;
    await q(`INSERT INTO dashboard_cards (user_id, key, data, received_at) VALUES ($1, $2, $3, now())
             ON CONFLICT (user_id, key) DO UPDATE SET data = EXCLUDED.data, received_at = now()`, [owner.id, c.key, data]);
    saved++;
  }
  res.json({ ok: true, saved });
}));

// ---------- texts ----------
app.get('/api/texts', requireUser, wrap(async (req, res) => {
  res.json({
    status: telnyxStatus(),
    threads: await many(
      `SELECT DISTINCT ON (peer) peer, body, direction, status, created_at,
         (SELECT count(*)::int FROM sms_messages u WHERE u.user_id = s.user_id AND u.peer = s.peer AND u.direction = 'inbound' AND u.read_at IS NULL) AS unread,
         EXISTS (SELECT 1 FROM sms_optouts o WHERE o.user_id = s.user_id AND o.peer = s.peer) AS opted_out
       FROM sms_messages s WHERE user_id = $1 ORDER BY peer, created_at DESC`, [req.user.id]),
  });
}));

app.get('/api/texts/:peer', requireUser, wrap(async (req, res) => {
  const peer = String(req.params.peer);
  const rows = await many(`SELECT id, direction, body, status, error, created_at FROM sms_messages WHERE user_id = $1 AND peer = $2 ORDER BY created_at`, [req.user.id, peer]);
  await q(`UPDATE sms_messages SET read_at = now() WHERE user_id = $1 AND peer = $2 AND direction = 'inbound' AND read_at IS NULL`, [req.user.id, peer]);
  const optedOut = Boolean(await one('SELECT 1 FROM sms_optouts WHERE user_id = $1 AND peer = $2', [req.user.id, peer]));
  res.json({ peer, messages: rows, optedOut, status: telnyxStatus() });
}));

app.post('/api/texts', requireUser, rateLimit({ windowMs: 60_000, max: 20 }), wrap(async (req, res) => {
  const r = await sendText(req.user.id, String(req.body?.to || ''), req.body?.text, req.body?.requestId);
  res.status(r.status).json(r.body);
}));

// ---------- library ----------
app.get('/api/library/search', requireUser, rateLimit({ windowMs: 60_000, max: 40 }), wrap(async (req, res) => {
  const status = libraryStatus();
  const query = String(req.query.q || '').trim().slice(0, 500);
  if (status.state !== 'connected' || !query) return res.json({ status, results: [] });
  try {
    res.json({ status, results: await searchLibrary(query) });
  } catch (err) {
    res.status(502).json({ status, error: err.name === 'AbortError' ? 'Your memory service took too long to answer.' : err.message });
  }
}));

// ---------- connections ----------
app.get('/api/connections', requireUser, wrap(async (req, res) => {
  const comp = composioStatus();
  let apps = [];
  let appsError = null;
  if (comp.state === 'connected') {
    try { apps = await listConnections(); } catch (err) { appsError = err.message; }
  }
  res.json({ hermes: await hermesStatus(), library: libraryStatus(), telnyx: telnyxStatus(), composio: comp, apps, appsError, checkedAt: new Date().toISOString() });
}));

app.post('/api/connections/composio/link', requireUser, rateLimit({ windowMs: 60_000, max: 10 }), wrap(async (req, res) => {
  if (composioStatus().state !== 'connected') return res.status(409).json({ error: 'Finish Composio setup first.' });
  const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  try {
    const link = await startLink(String(req.body?.app || '').toLowerCase(), `${base}/connections?linked=1`);
    await audit(req.user.id, 'composio.link', req.body?.app);
    res.json(link);
  } catch (err) {
    res.status(err.status && err.status < 500 ? err.status : 502).json({ error: err.message });
  }
}));

// ---------- the web app ----------
const publicDir = fileURLToPath(new URL('../public', import.meta.url));
app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
app.get(/^\/(?!api\/|webhooks\/|agent\/).*/, (_req, res) => res.sendFile(`${publicDir}/index.html`));

app.use((err, _req, res, _next) => {
  console.error('[app] error:', err.message);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

await migrate();
await resumeOpenRuns();
const server = app.listen(PORT, () => console.log(`Total Recall Starter running on port ${PORT}`));
const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
