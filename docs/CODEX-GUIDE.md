# Guide for your builder (Codex)

This guide is for Codex, or whichever builder the student uses. The student pastes a short prompt that points here. Follow this guide step by step. Write in plain English with short sentences. Ask one question at a time and give your recommended answer.

## Ground rules

1. **The student owns everything:** their GitHub, Railway, database, keys and bills. This kit only gives them a starting point. Once they copy it, it is their code. Nothing may depend on anyone else's code, accounts, keys or servers.
2. **Never ask for a secret in chat.** Tell the student exactly where to paste it themselves (Railway Variables, their local `.env`, or a hidden terminal prompt). Never print, log or commit a secret.
3. **Preserve what works.** Before you change anything, find their existing Hermes, memory service, database, email and text routes, and any app they already built. Back up before you replace anything.
4. **Real data or an honest label.** Never fake a number, a "connected" state or a test that did not run. When something is pending, say "pending".
5. **One step at a time.** Do a step, prove it worked, save progress, then go to the next. If something fails, show the exact error and fix that before moving on.
6. **Stay inside the guide.** If you think something extra is needed, ask first and put it under "Later ideas" in their progress file.
7. **Track progress.** Use the student's `my-kit/02-progress.md` (or the equivalent progress file) to record each step, with the date and the proof.

## Step 0: Find out where they are

Read `my-kit/00-START-HERE.md`, `my-kit/01-my-plan.md` and `my-kit/02-progress.md` if they exist. Check what is actually running, and change nothing yet:

- **Hermes:** where it runs, its version, whether the API server is on (`API_SERVER_ENABLED`), and whether `GET /v1/capabilities` answers with `run_submission` and `run_events_sse` set to true. If Hermes is older, plan an update first.
- **Railway:** their project, their Postgres, and their memory service from lessons 4.1 to 4.3, if they built them.
- **Any web app they already built** in Module 4 (repo, URL and what works).
- **Telnyx:** their number, and whether it's approved to send.
- **Composio:** whether their Hermes already uses it, and which user id it uses.

Then ask one question:

> **Which path fits you?**
> - **A. Fresh install.** I don't have a web app yet, or I'm happy to replace mine with this one. *(Recommended if you're at lesson 4.4 or 4.5, or your app is mostly empty.)*
> - **B. Make mine look like this.** I already have a working app with data and features I want to keep. Bring this layout and these features into it.

Recommend A when their app has no real data or features yet. Recommend B when it does.

---

## Path A: Fresh install

### A1. Copy the starter into their GitHub

1. Have them open https://github.com/MattCMilne/total-recall-starter and click **Use this template > Create a new repository**.
2. Name it something like `my-total-recall`. Set it to **Private**.
3. Clone it into their projects folder. If they prefer, you can do it with `git clone` and `gh repo create --private`.

Then read `README.md`, `docs/HOW-IT-WORKS.md` and `docs/ENV.md` in full.

**Proof:** a private repo in their account, and the code on their computer.

### A2. Run it locally first

1. Install Node 20+ if it's missing, then run `npm install`.
2. Use a local Postgres or a scratch Railway database. Do not use their real library database for this test.
3. Start the pretend agent in one terminal: `node scripts/mock-hermes.js`.
4. Copy `.env.example` to `.env`. Set `DATABASE_URL` to the scratch database, `HERMES_API_URL=http://127.0.0.1:8649` and `HERMES_API_KEY=mock-key-for-local-tests-only`.
5. Run `npm run create-owner -- their@email "Their Name"`. The student types the password themselves.
6. Run `npm test`, `npm run check` and `npm start`.
7. Have them sign in at http://localhost:3000 and try:
   - send a chat;
   - send a message containing the word "approval" and approve it;
   - star, rename and archive a chat, then restore it from **Archived chats** and delete one forever;
   - create a project and move a chat into it.

**Proof:** they did each of those with their own hands and saw it work. This is still the pretend agent. Say so.

### A3. Deploy to Railway

1. Use their existing Railway project from 4.1 if they have one, otherwise a new one.
2. Add a service from their GitHub repo.
3. Set `DATABASE_URL` as a reference to their Postgres. It's safe to share the 4.1 database: this app keeps its tables in its own `tr_app` schema and never touches their library tables.
4. Set `NODE_ENV=production`.
5. Generate a Railway domain.
6. Create their login with `railway run npm run create-owner -- their@email "Their Name"`.

**Proof:** they sign in on their phone at the Railway URL. A signed-out request to `/api/conversations` returns 401.

### A4. Connect their real Hermes

1. Their Hermes needs `API_SERVER_ENABLED=true` and a strong `API_SERVER_KEY` (`openssl rand -hex 32`). Changing Hermes config needs their OK and a gateway restart.
2. Choose one secure route from the app to Hermes, and explain it in plain words:
   - **Hermes on a VPS or Railway:** HTTPS in front of the API port, with only `/v1/*` exposed. Use Railway private networking if both run there.
   - **Hermes on their own computer:** a named Cloudflare Tunnel with an Access service token. Put the token in `HERMES_ACCESS_CLIENT_ID` and `HERMES_ACCESS_CLIENT_SECRET`. The computer must be awake for chat to work.
   - Never open the Hermes port to the internet without the key. Never put the key in browser code.
3. In Railway Variables, they set `HERMES_API_URL` and `HERMES_API_KEY` themselves.

**Proof:**
- **Connections** shows "Your agent: Connected".
- A real question about something in their library is answered by their own Hermes in the app.
- A refresh mid-answer still shows the finished answer.
- With Hermes switched off, the app says it's offline and nothing pretends to reply.
- If their Hermes asks for approval on something (for example a terminal command), the card shows up and their decision reaches Hermes.

### A5. Smart chat names

Set `TITLE_API_KEY` to an OpenAI key. The embedding key from lesson 4.1 works, and naming costs a fraction of a cent per chat.

**Proof:** a new chat gets a short, clear name after the first reply. A chat they renamed keeps their name.

### A6. Library

Point `MEMORY_SEARCH_URL` (and `MEMORY_SEARCH_KEY` if needed) at the search endpoint of the memory service from 4.2. If its request or response shape differs, change only the `toResults()` function or the request in `server/library.js`. Don't build a second library.

**Proof:** a search returns results with links that open the real source.

### A7. Texting with Telnyx (if their plan uses business texting)

1. In Railway Variables, they add `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY` (Keys & Credentials > Public Key) and `TELNYX_FROM_NUMBER`.
2. Set their Telnyx messaging profile's webhook URL to `https://<their app>/webhooks/telnyx`. The Connections page shows the exact address.
3. If they already have a Telnyx receiver from lesson 3.4, don't break it. Either keep it and leave this app's Texts page for later, or move the webhook here once this one passes, with their OK. Never run two receivers that both reply.
4. Leave `TELNYX_SENDING_ENABLED` off until their number is approved to send. A pending approval is not a pass.

**Proof:**
- A text from their own phone appears in **Texts**.
- A reply sent from the app (after the confirm step) arrives on their phone, and its status moves to delivered.
- Texting STOP blocks sending.

### A8. Apps with Composio (if their plan uses it)

1. They create a Composio project (or use their existing one), then add `COMPOSIO_API_KEY` and `COMPOSIO_USER_ID` in Railway Variables.
2. `COMPOSIO_USER_ID` must be the same id their Hermes uses, so apps linked in the app are apps the agent can use. Find what their Hermes uses before setting it.

**Proof:** Connections lists their linked apps. **Connect app** with one app (for example `gmail`) opens Composio's sign-in, and after they finish, the app shows as Connected. Then ask Hermes in chat to do one harmless read with that app.

### A9. Agent dashboard cards (optional)

1. Set `DASHBOARD_PUSH_KEY` in Railway (a long random value).
2. Give their Hermes the same value in its own environment. Never in chat.
3. Help them pick 3 to 5 cards from their plan, each tied to a decision they make.
4. Use the agent prompt in `docs/CUSTOMIZE.md` to set up a scheduled job.

**Proof:** a card from their agent shows on the dashboard, with its source and updated time.

### A10. Make it theirs

Walk them through **Settings**:

- app name;
- agent name;
- logo letters;
- accent colour;
- light or dark;
- time zone;
- home page;
- menu order;
- one custom page (for example their SOPs) and one link.

Then show them `docs/CUSTOMIZE.md` and ask what they'd change next. Put bigger ideas under "Later ideas".

**Proof:** their name and colours show on their phone after a reload.

---

## Path B: Make my existing platform look and work like this

Goal: keep their data, routes and working connections, and bring in this layout and these features. Don't replace a working app in one jump.

### B1. Compare

1. Clone https://github.com/MattCMilne/total-recall-starter into a separate folder as a reference. Read its docs.
2. Build a side-by-side table of their app against this checklist. Mark each row **have**, **partly** or **missing**:
   - sidebar: brand block, New chat button, menu, Chats list, Archived chats, account menu at the bottom; a slide-out drawer on phones;
   - dashboard cards with source, updated time and an honest status;
   - chat through the Hermes runs API (`/v1/runs` plus events), live text and a working status, with stop;
   - refresh and restart safety (the answer is saved from events, and open runs are picked up on boot);
   - real approval cards from `approval.request`, never auto-approved;
   - smart chat names (first-message name, then a 3–5 word name, never replacing their own name);
   - three-dot menu on every chat: Star, Rename, Add to project, Archive;
   - archive instead of delete, with an Archived chats page offering Restore and Delete forever;
   - projects (create, rename, delete-keeps-chats, project page);
   - "Powered by Total Recall" under the chat box;
   - Texts page (Telnyx: signed webhook, STOP, statuses that never go backwards, confirm before sending);
   - Connections page (Hermes, library, Telnyx, Composio apps, plus Connect app);
   - Settings (name, agent name, logo, accent, theme, home page, menu editor, custom pages and links);
   - security: server-checked session, same-origin writes, no keys in the browser.
3. Show them the table. Ask which rows to bring over first. Recommend this order: layout and sidebar, chat menu with archive, projects, smart names, "Powered by" footer, Connections, then Texts and Composio.

### B2. Bring it over one piece at a time

For each piece:

1. Read how the starter does it (the file names are in `docs/HOW-IT-WORKS.md`).
2. Build it in their app's own stack and style. Don't paste a second framework into their app.
3. Reuse their tables where they fit. Add only the missing columns or tables, using idempotent migrations. Never drop or rename a table that holds their data. Back up the database before any migration.
4. Test it the same way as the matching Path A proof.
5. Commit, deploy, and have them check it on their phone.

**Shortcut, if they want it:** If their app is small and they'd rather have the starter's front end, deploy the starter as a second Railway service pointing at the same Hermes. Move their custom pages over, compare the two side by side, and switch only when they say so. Their existing app keeps running until then.

### B3. Keep chats safe

- If they already have chats in their own tables, don't move them without a written plan, a backup and a count check before and after.
- If their app already uses chat completions, switch to the runs API only after the runs path passes the A4 proof.

---

## When you finish

Update their progress file with:

- what is live and its URL;
- which connections pass and which are pending;
- the proof for each step;
- "Later ideas".

Then stop and tell them in three short lines what they can do now.
