// Talks to YOUR Hermes through its API server, from this server only.
// Contract: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
//   POST /v1/runs                       start a run, returns run_id
//   GET  /v1/runs/{id}/events           SSE: message.delta, tool.started, approval.request, run.completed ...
//   GET  /v1/runs/{id}                  pollable status (used to reconcile after a restart)
//   POST /v1/runs/{id}/approval         {choice, request_id}
//   POST /v1/runs/{id}/stop
// The Hermes key never leaves this server.

const base = () => (process.env.HERMES_API_URL || '').replace(/\/+$/, '');
const key = () => process.env.HERMES_API_KEY || '';

export function hermesConfigured() {
  return Boolean(base() && key());
}

function headers(extra = {}) {
  const h = { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json', ...extra };
  // Optional: Cloudflare Access service token in front of a tunnelled Hermes.
  if (process.env.HERMES_ACCESS_CLIENT_ID) {
    h['CF-Access-Client-Id'] = process.env.HERMES_ACCESS_CLIENT_ID;
    h['CF-Access-Client-Secret'] = process.env.HERMES_ACCESS_CLIENT_SECRET || '';
  }
  return h;
}

async function call(method, path, body, { timeoutMs = 15000, extraHeaders } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(base() + path, {
      method,
      headers: headers(extraHeaders),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

/** Health + capability check, used by the Connections page and the chat header. */
export async function hermesStatus() {
  if (!hermesConfigured()) return { state: 'not_connected', detail: 'HERMES_API_URL and HERMES_API_KEY are not set.' };
  try {
    const r = await call('GET', '/v1/capabilities', undefined, { timeoutMs: 6000 });
    if (r.status === 401 || r.status === 403) return { state: 'needs_attention', detail: 'Hermes refused the key. Check HERMES_API_KEY.' };
    if (!r.ok) return { state: 'needs_attention', detail: `Connection needs checking (HTTP ${r.status}).` };
    const f = r.json?.features || {};
    if (!f.run_submission || !f.run_events_sse) {
      return { state: 'needs_attention', detail: 'Version unsupported: this Hermes does not offer the runs API. Update Hermes.' };
    }
    return { state: 'connected', detail: f.run_approval_response ? 'Connected, with approvals.' : 'Connected.', approvals: Boolean(f.run_approval_response) };
  } catch (err) {
    return { state: 'offline', detail: 'Your agent could not be reached. Is Hermes running?' };
  }
}

export async function startRun({ input, sessionId, sessionKey, idempotencyKey, instructions }) {
  return call('POST', '/v1/runs', { input, session_id: sessionId, instructions }, {
    timeoutMs: 30000,
    extraHeaders: {
      'X-Hermes-Session-Key': sessionKey,
      'Idempotency-Key': idempotencyKey,
    },
  });
}

export const getRun = (runId) => call('GET', `/v1/runs/${encodeURIComponent(runId)}`, undefined, { timeoutMs: 8000 });
export const stopRun = (runId) => call('POST', `/v1/runs/${encodeURIComponent(runId)}/stop`, {});
export const answerApproval = (runId, choice, requestId) =>
  call('POST', `/v1/runs/${encodeURIComponent(runId)}/approval`, requestId ? { choice, request_id: requestId } : { choice });

/**
 * Reads the run's SSE stream and calls onEvent for every JSON event.
 * Resolves when the stream closes. Pass lastSeq to resume after a dropped connection.
 */
export async function streamRunEvents(runId, { lastSeq = -1, onEvent, signal }) {
  const res = await fetch(`${base()}/v1/runs/${encodeURIComponent(runId)}/events`, {
    headers: { ...headers(), Accept: 'text/event-stream', ...(lastSeq >= 0 ? { 'Last-Event-ID': String(lastSeq) } : {}) },
    signal,
  });
  if (!res.ok || !res.body) {
    const err = new Error(`events stream failed (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (!data) continue; // comment / keepalive frame
      try { await onEvent(JSON.parse(data)); } catch (err) { console.error('[hermes] event handler error:', err.message); }
    }
  }
}
