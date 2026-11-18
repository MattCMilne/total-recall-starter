// Checks your setup and prints what works and what is missing. Never prints a secret.
//   npm run check            (locally, with your .env loaded)
//   railway run npm run check
const results = [];
const add = (name, ok, detail) => results.push({ name, ok, detail });
const has = (k) => Boolean(process.env[k]);

add('DATABASE_URL set', has('DATABASE_URL'), 'Your Postgres connection string.');
if (has('DATABASE_URL')) {
  try {
    const { pool, migrate } = await import('../server/db.js');
    await migrate();
    const r = await pool.query('SELECT count(*)::int AS n FROM users');
    add('Database reachable and schema ready', true, `${r.rows[0].n} login(s) exist.`);
    if (r.rows[0].n === 0) add('Owner login created', false, 'Run: npm run create-owner -- you@example.com "Your Name"');
    await pool.end();
  } catch (err) {
    add('Database reachable and schema ready', false, err.message);
  }
}

add('HERMES_API_URL and HERMES_API_KEY set', has('HERMES_API_URL') && has('HERMES_API_KEY'), 'Where the app reaches your Hermes.');
if (has('HERMES_API_URL') && has('HERMES_API_KEY')) {
  const { hermesStatus } = await import('../server/hermes.js');
  const s = await hermesStatus();
  add('Hermes answers with the runs API', s.state === 'connected', s.detail);
}

const { telnyxStatus } = await import('../server/telnyx.js');
const t = telnyxStatus();
add('Texting (optional)', t.state !== 'not_connected', t.detail);

const { composioStatus } = await import('../server/composio.js');
const c = composioStatus();
add('Composio (optional)', c.state === 'connected', c.detail);

add('Smart chat names (optional)', has('TITLE_API_KEY') || has('OPENAI_API_KEY'), 'Without a key, chats keep their first-message names.');
add('Library search (optional)', has('MEMORY_SEARCH_URL'), 'Point MEMORY_SEARCH_URL at the memory service your Hermes uses.');
add('Agent dashboard cards (optional)', has('DASHBOARD_PUSH_KEY'), 'Lets your agent post cards to /agent/dashboard.');

for (const r of results) console.log(`${r.ok ? 'PASS' : 'TODO'}  ${r.name}  ${r.detail ? '- ' + r.detail : ''}`);
const required = results.slice(0, 4).filter((r) => !r.ok && !/optional/.test(r.name));
process.exit(required.length ? 1 : 0);
