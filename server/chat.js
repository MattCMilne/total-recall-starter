// Chat with your Hermes. The browser talks to this server; this server talks to Hermes.
// Each message runs as one Hermes run. Its events are saved, so a refresh or a restart
// never loses the answer, and approvals show only when Hermes really asks.
import crypto from 'node:crypto';
import { one, many, q } from './db.js';
import { startRun, streamRunEvents, getRun, stopRun, answerApproval, hermesConfigured } from './hermes.js';
import { retitleInBackground, firstMessageTitle } from './titles.js';
import { getSettings } from './settings.js';

const listeners = new Map(); // conversationId -> Set<fn(event)>
const active = new Set();    // run ids this process is following

export function subscribe(conversationId, fn) {
  if (!listeners.has(conversationId)) listeners.set(conversationId, new Set());
  listeners.get(conversationId).add(fn);
  return () => listeners.get(conversationId)?.delete(fn);
}
function publish(conversationId, event) {
  for (const fn of listeners.get(conversationId) || []) { try { fn(event); } catch { /* closed */ } }
}

function contextNote(settings, user) {
  const tz = settings.brand.timeZone;
  const now = new Date().toLocaleString('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' });
  return [
    `This message comes from ${user.name || 'the owner'} in their own web app (${settings.brand.appName}).`,
    `Their local time is ${now} (${tz}).`,
    'This chat renders Markdown. Keep replies readable on a phone.',
  ].join(' ');
}

export async function sendMessage(user, conversationId, text, clientRequestId) {
  const conv = await one('SELECT * FROM conversations WHERE id = $1 AND user_id = $2', [conversationId, user.id]);
  if (!conv) return { status: 404, body: { error: 'Chat not found.' } };
  if (conv.archived_at) return { status: 409, body: { error: 'Restore this chat before sending.' } };
  const busy = await one(`SELECT id FROM messages WHERE conversation_id = $1 AND role = 'assistant' AND status IN ('running','waiting')`, [conv.id]);
  if (busy) return { status: 409, body: { error: 'Your agent is still working on the last message.' } };
  if (!hermesConfigured()) return { status: 503, body: { error: 'Your agent is not connected yet. Open Connections to finish setup.' } };

  const requestId = /^[A-Za-z0-9_-]{8,80}$/.test(clientRequestId || '') ? clientRequestId : crypto.randomUUID();
  const userMsg = await one(
    `INSERT INTO messages (conversation_id, role, content, status) VALUES ($1, 'user', $2, 'done') RETURNING *`, [conv.id, text]);
  const reply = await one(
    `INSERT INTO messages (conversation_id, role, content, status) VALUES ($1, 'assistant', '', 'running') RETURNING *`, [conv.id]);
  const title = !conv.title_set_by_owner && conv.auto_title_stage === 0 && conv.title === 'New chat' ? firstMessageTitle(text) : conv.title;
  await q('UPDATE conversations SET updated_at = now(), title = $2 WHERE id = $1', [conv.id, title]);

  const settings = await getSettings(user.id);
  let started;
  try {
    started = await startRun({
      input: text,
      sessionId: conv.hermes_session_id,
      sessionKey: `total-recall-app:${user.id}`,
      idempotencyKey: `tr-${requestId}`,
      instructions: contextNote(settings, user),
    });
  } catch (err) {
    await failReply(reply.id, conv.id, 'Your agent could not be reached. Nothing was sent. Try again when it is back online.');
    return { status: 502, body: { error: 'Your agent is offline.', messages: [userMsg] } };
  }
  const runId = started.json?.run_id;
  if (!started.ok || !runId) {
    const reason = started.status === 429 ? 'Your agent is busy with other work. Try again in a minute.'
      : started.status === 409 ? 'Your agent says this request conflicts with one already sent. Refresh before retrying.'
      : `Your agent refused the request (HTTP ${started.status}).`;
    await failReply(reply.id, conv.id, reason);
    return { status: 502, body: { error: reason } };
  }
  await q('UPDATE messages SET run_id = $2 WHERE id = $1', [reply.id, runId]);
  followRun(conv.id, reply.id, runId);
  return { status: 202, body: { userMessage: userMsg, reply: { ...reply, run_id: runId }, title } };
}

async function failReply(messageId, conversationId, error) {
  await q(`UPDATE messages SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [messageId, error]);
  publish(conversationId, { type: 'message', id: messageId, status: 'failed', error });
}

async function finish(conversationId, messageId, status, content, error) {
  const updated = await one(
    `UPDATE messages SET status = $2, content = COALESCE($3, content), error = $4, updated_at = now()
     WHERE id = $1 AND status IN ('running','waiting') RETURNING id`, [messageId, status, content, error || null]);
  if (!updated) return; // already settled
  await q(`UPDATE approvals SET decision = COALESCE(decision, 'expired'), decided_at = COALESCE(decided_at, now()) WHERE message_id = $1`, [messageId]);
  const msg = await one('SELECT content FROM messages WHERE id = $1', [messageId]);
  publish(conversationId, { type: 'message', id: messageId, status, content: msg.content, error: error || null });
  if (status === 'done') retitleInBackground(conversationId).then(async () => {
    const c = await one('SELECT title FROM conversations WHERE id = $1', [conversationId]);
    if (c) publish(conversationId, { type: 'title', title: c.title });
  });
}

/** Follows one run's events until it ends. Safe to call again after a restart. */
export function followRun(conversationId, messageId, runId) {
  if (active.has(runId)) return;
  active.add(runId);
  (async () => {
    let lastSeq = -1;
    let text = '';
    let settled = false;
    const onEvent = async (ev) => {
      if (typeof ev.seq === 'number') lastSeq = ev.seq;
      switch (ev.event) {
        case 'message.delta':
          text += ev.delta || '';
          publish(conversationId, { type: 'delta', id: messageId, delta: ev.delta || '' });
          break;
        case 'tool.started':
          // Show THAT the agent is working, never the tool's inputs or outputs.
          publish(conversationId, { type: 'progress', id: messageId, label: `Using ${String(ev.tool || 'a tool').replace(/_/g, ' ')}` });
          break;
        case 'approval.request': {
          const requestKey = ev.request_id || `seq-${ev.seq ?? Date.now()}`;
          const summary = String(ev.description || ev.command || 'Your agent wants to take an action that needs your OK.').slice(0, 1200);
          const choices = Array.isArray(ev.choices) && ev.choices.length ? ev.choices : ['once', 'deny'];
          const row = await one(
            `INSERT INTO approvals (message_id, run_id, request_key, request_id, summary, choices)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (run_id, request_key) DO UPDATE SET summary = EXCLUDED.summary RETURNING *`,
            [messageId, runId, requestKey, ev.request_id || null, summary, JSON.stringify(choices)]);
          await q(`UPDATE messages SET status = 'waiting', updated_at = now() WHERE id = $1 AND status = 'running'`, [messageId]);
          publish(conversationId, { type: 'approval', id: messageId, approval: row });
          break;
        }
        case 'approval.responded':
          await q(`UPDATE messages SET status = 'running', updated_at = now() WHERE id = $1 AND status = 'waiting'`, [messageId]);
          publish(conversationId, { type: 'message', id: messageId, status: 'running' });
          break;
        case 'run.completed':
          settled = true;
          await finish(conversationId, messageId, 'done', ev.output ?? text);
          break;
        case 'run.failed':
          settled = true;
          await finish(conversationId, messageId, 'failed', text || null, String(ev.error || 'Your agent hit an error.').slice(0, 500));
          break;
        case 'run.cancelled':
        case 'run.interrupted':
          settled = true;
          await finish(conversationId, messageId, 'stopped', text || null, ev.event === 'run.interrupted' ? 'Your agent restarted before finishing.' : null);
          break;
        default:
          break;
      }
    };
    for (let attempt = 0; attempt < 4 && !settled; attempt++) {
      try {
        await streamRunEvents(runId, { lastSeq, onEvent });
      } catch (err) {
        if (err.status === 404) break; // event buffer gone: reconcile by status below
      }
      if (!settled) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!settled) await reconcile(conversationId, messageId, runId, text);
  })().finally(() => active.delete(runId));
}

/** Uses the run's pollable status when the event stream is gone (restart, long disconnect). */
async function reconcile(conversationId, messageId, runId, partial) {
  for (let i = 0; i < 120; i++) {
    let r;
    try { r = await getRun(runId); } catch { r = null; }
    const s = r?.json?.status;
    if (r?.status === 404) return finish(conversationId, messageId, 'failed', partial || null, 'Your agent no longer has this run. Check its own history; it may have finished.');
    if (s === 'completed') return finish(conversationId, messageId, 'done', r.json.output ?? partial);
    if (s === 'failed') return finish(conversationId, messageId, 'failed', partial || null, String(r.json.error || 'Your agent hit an error.'));
    if (['cancelled', 'interrupted'].includes(s)) return finish(conversationId, messageId, 'stopped', partial || null, null);
    await new Promise((res) => setTimeout(res, 5000));
  }
  // Still unknown after ten minutes: say so honestly instead of guessing.
  await finish(conversationId, messageId, 'failed', partial || null, 'Lost track of this answer. Your agent may still finish it in its own history.');
}

/** On boot, pick up any answer that was in progress when the app restarted. */
export async function resumeOpenRuns() {
  const open = await many(`SELECT m.id, m.run_id, m.conversation_id FROM messages m WHERE m.status IN ('running','waiting') AND m.run_id IS NOT NULL`);
  for (const m of open) followRun(m.conversation_id, m.id, m.run_id);
  await q(`UPDATE messages SET status = 'failed', error = 'The app restarted before your agent received this.' WHERE status IN ('running','waiting') AND run_id IS NULL`);
}

export async function decideApproval(user, approvalId, choice) {
  const a = await one(
    `SELECT a.*, m.conversation_id FROM approvals a JOIN messages m ON m.id = a.message_id
     JOIN conversations c ON c.id = m.conversation_id WHERE a.id = $1 AND c.user_id = $2`, [approvalId, user.id]);
  if (!a) return { status: 404, body: { error: 'Approval not found.' } };
  if (a.decision) return { status: 409, body: { error: 'Already decided.', approval: a } };
  if (!a.choices.includes(choice)) return { status: 400, body: { error: 'That choice was not offered.' } };
  const r = await answerApproval(a.run_id, choice, a.request_id);
  if (!r.ok) {
    if (r.status === 409) {
      const row = await one(`UPDATE approvals SET decision = 'already settled', decided_at = now() WHERE id = $1 RETURNING *`, [a.id]);
      publish(a.conversation_id, { type: 'approval', id: a.message_id, approval: row });
      return { status: 409, body: { error: 'Your agent already settled this request.', approval: row } };
    }
    return { status: 502, body: { error: `Your agent did not accept the decision (HTTP ${r.status}).` } };
  }
  const row = await one(`UPDATE approvals SET decision = $2, decided_at = now() WHERE id = $1 RETURNING *`, [a.id, choice]);
  await q(`INSERT INTO audit_log (user_id, action, target) VALUES ($1, 'approval', $2)`, [user.id, `${a.run_id}:${choice}`]);
  publish(a.conversation_id, { type: 'approval', id: a.message_id, approval: row });
  return { status: 200, body: { approval: row } };
}

export async function stopReply(user, messageId) {
  const m = await one(
    `SELECT m.* FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE m.id = $1 AND c.user_id = $2 AND m.status IN ('running','waiting')`, [messageId, user.id]);
  if (!m?.run_id) return { status: 404, body: { error: 'Nothing is running.' } };
  const r = await stopRun(m.run_id);
  return r.ok ? { status: 202, body: { ok: true } } : { status: 502, body: { error: `Your agent did not stop (HTTP ${r.status}).` } };
}
