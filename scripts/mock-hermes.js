// A pretend Hermes for testing the app without a real agent. Never use it in production.
// It implements the small slice of the Hermes runs API the app uses.
//   node scripts/mock-hermes.js            (listens on 8649, key "mock-key-for-local-tests-only")
// Send a message containing "approval" to get an approval card; "fail" to get a failed run.
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 8649);
const KEY = process.env.MOCK_KEY || 'mock-key-for-local-tests-only';
const runs = new Map();

function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
function push(run, event) {
  const ev = { ...event, run_id: run.id, seq: run.events.length, timestamp: Date.now() / 1000 };
  run.events.push(ev);
  for (const s of run.subs) s.write(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`);
  if (event.event?.startsWith('run.')) { run.status = event.event.slice(4); for (const s of run.subs) s.end(); run.subs.clear(); }
}
async function play(run) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(150);
  if (/fail/i.test(run.input)) return push(run, { event: 'run.failed', error: 'Pretend failure for testing.' });
  push(run, { event: 'tool.started', tool: 'memory_search', preview: '(hidden)' });
  await wait(150);
  if (/approval/i.test(run.input)) {
    run.status = 'waiting_for_approval';
    push(run, { event: 'approval.request', request_id: `req_${run.id}`, description: 'Send an email to test@example.com', command: 'send_email test@example.com', choices: ['once', 'session', 'deny'] });
    await new Promise((r) => { run.release = r; });
    push(run, { event: 'approval.responded', choice: run.choice });
  }
  const answer = run.choice === 'deny'
    ? 'Okay, I did not send it.'
    : `Got it. This reply comes from the **test agent** (scripts/mock-hermes.js), so you can try every screen before your real Hermes is connected.\n\n- You asked: "${run.input.slice(0, 80)}"\n- Next step: connect your real Hermes on the **Connections** page.`;
  for (const part of answer.match(/.{1,12}/g)) { push(run, { event: 'message.delta', delta: part }); await wait(30); }
  push(run, { event: 'run.completed', output: answer });
}

http.createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${KEY}`) return json(res, 401, { error: 'unauthorized' });
  const url = new URL(req.url, 'http://x');
  let body = '';
  for await (const c of req) body += c;
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.pathname === '/v1/capabilities') return json(res, 200, { model: 'mock-hermes', features: { run_submission: true, run_events_sse: true, run_approval_response: true } });
  if (req.method === 'POST' && url.pathname === '/v1/runs') {
    const b = JSON.parse(body || '{}');
    const id = `run_${Math.random().toString(16).slice(2)}`;
    const run = { id, input: b.input, events: [], subs: new Set(), status: 'running' };
    runs.set(id, run);
    play(run);
    return json(res, 202, { run_id: id, status: 'started' });
  }
  const run = runs.get(parts[2]);
  if (!run) return json(res, 404, { error: 'run not found' });
  if (req.method === 'GET' && parts[3] === 'events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(': open\n\n');
    const last = Number(req.headers['last-event-id'] ?? -1);
    for (const ev of run.events.filter((e) => e.seq > last)) res.write(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`);
    if (['completed', 'failed', 'cancelled'].includes(run.status)) return res.end();
    run.subs.add(res);
    req.on('close', () => run.subs.delete(res));
    return;
  }
  if (req.method === 'POST' && parts[3] === 'approval') {
    if (!run.release) return json(res, 409, { error: 'approval_not_pending' });
    run.choice = JSON.parse(body).choice;
    const r = run.release; run.release = null; r();
    return json(res, 200, { object: 'hermes.run.approval_response', choice: run.choice });
  }
  if (req.method === 'POST' && parts[3] === 'stop') { push(run, { event: 'run.cancelled' }); return json(res, 200, { ok: true }); }
  if (req.method === 'GET' && parts.length === 3) return json(res, 200, { run_id: run.id, status: run.status, output: run.events.find((e) => e.event === 'run.completed')?.output });
  json(res, 404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log(`Mock Hermes on http://127.0.0.1:${PORT}`));
