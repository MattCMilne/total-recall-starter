# How it works

## The shape

```
Your phone or laptop (browser)
        │  signed-in session cookie
        ▼
This app on Railway (server/index.js) ── Postgres (your chats, projects, settings, texts)
        │  server-side only, with your keys
        ├──► Your Hermes API server  (/v1/runs, events, approval, stop)
        ├──► Telnyx                   (send texts; Telnyx calls /webhooks/telnyx)
        ├──► Composio                 (list and link apps)
        └──► Your memory service      (Library search)
```

## Files

| File | What it does |
|---|---|
| `server/index.js` | All routes, the security headers and startup. |
| `server/schema.sql` | Every table. It runs on each start and is safe to repeat. |
| `server/auth.js` | Sign-in, sessions (stored hashed), the same-origin check and rate limits. |
| `server/chat.js` | Sends each message as one Hermes run, follows its events, saves the answer and approvals, and picks up unfinished runs after a restart. |
| `server/hermes.js` | The small client for the Hermes runs API. |
| `server/titles.js` | Smart chat names. |
| `server/settings.js` | Name, colours and menu, saved per login. |
| `server/telnyx.js` | Texting: signature check, saving events, STOP, statuses that never go backwards, and sending. |
| `server/composio.js` | Listing linked apps and starting a sign-in link. |
| `server/library.js` | One adapter to your memory service's search. |
| `public/app.js` | The whole web app: sidebar, pages, chat and menus. |
| `public/app.css` | All styles. Colours are variables at the top. |
| `public/markdown.js` | A safe Markdown renderer (escapes everything first). |
| `scripts/create-owner.js` | Creates or resets your login. |
| `scripts/check-setup.js` | Prints what works and what's missing. |
| `scripts/mock-hermes.js` | A pretend Hermes for local testing only. |

## Chat, step by step

1. You send a message. The app saves it, plus an empty reply marked **running**.
2. The server calls `POST /v1/runs` on your Hermes with:
   - the chat's own session id;
   - a stable `X-Hermes-Session-Key`, so memory stays scoped to you;
   - an `Idempotency-Key`, so a retry never runs the request twice;
   - a short note with your name, your time zone and the fact that the chat renders Markdown.
3. The server follows `/v1/runs/{id}/events` and passes progress to your browser:
   - text as it arrives;
   - "Using memory search" while a tool runs (never the tool's inputs or outputs);
   - approval requests.
4. `run.completed` saves the final answer. `run.failed` and `run.cancelled` save an honest status.
5. If the app restarts mid-answer, it finds the open run on boot and checks `GET /v1/runs/{id}` until it ends.

## Approvals

Hermes sends `approval.request` when a tool needs your OK. The app saves it as a card with only the choices Hermes offered. Your click goes from the server to `POST /v1/runs/{id}/approval`, and the card then shows what you chose and when. A card is never shown unless Hermes asked, and nothing is approved automatically.

## Dashboard cards

- **App cards** are counted from your own tables: chats this week, unread texts, projects, agent status and connections.
- **Agent cards:** your Hermes posts to `/agent/dashboard` with `Authorization: Bearer <DASHBOARD_PUSH_KEY>`. The key decides whose dashboard it is, so there is no user field to fake. Here is an example your agent can send on a schedule:

```json
{ "cards": [ { "key": "leads_today", "title": "New leads today", "value": 4,
  "items": ["Jane D. from the website", "..."], "source": "CRM via my agent", "status": "live" } ] }
```

Cards that look like they contain a key or password are refused.

## Texts

Telnyx calls `/webhooks/telnyx`. The app:
1. checks the Ed25519 signature;
2. saves the event once, by its unique id;
3. then answers 200.

A message of STOP blocks future sends to that person until they text START. Sends write an intent row first, so a retry never double-sends, and statuses only ever move forward.

## Archive and delete

**Archive** sets `archived_at`, and the chat leaves your sidebar. **Delete forever** only works on archived chats, and only removes that chat and its messages.

## Changing it

Ask your builder to change the code with you. Keep the rules in the README. If you add a table, add it to `server/schema.sql` with `CREATE TABLE IF NOT EXISTS`, so every deploy stays safe.
