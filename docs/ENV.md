# Environment variables

Names only. Put the values in Railway's **Variables** tab (or a local `.env` you never commit). Never paste a value into a chat, a screenshot, Git or a saved plan.

## Required

| Name | What it is | Secret? |
|---|---|---|
| `DATABASE_URL` | Your Railway Postgres connection string. On Railway, use a variable reference to your Postgres service. | Yes |
| `HERMES_API_URL` | Where this app reaches your Hermes API server, for example `https://agent.yourdomain.com`. No trailing slash. | No |
| `HERMES_API_KEY` | The `API_SERVER_KEY` from your Hermes `.env`. | Yes |
| `NODE_ENV` | Set to `production` on Railway, so sign-in cookies are secure. | No |

## Optional

| Name | What it does | Secret? |
|---|---|---|
| `DATABASE_SCHEMA` | The Postgres schema for this app's tables. Default `tr_app`, so it can share a database with your memory library without clashing. | No |
| `OWNER_EMAIL` | Which login owns incoming texts and agent dashboard cards. Defaults to the first account created. | No |
| `APP_URL` | Your app's public address, used for the Composio return link. Defaults to the address you visited. | No |
| `HERMES_ACCESS_CLIENT_ID` / `HERMES_ACCESS_CLIENT_SECRET` | A Cloudflare Access service token, if your Hermes sits behind a Cloudflare Tunnel with Access. | Yes |
| `TITLE_API_KEY` | Key for the small model that names chats. Falls back to `OPENAI_API_KEY`. Without either, chats keep their first-message names. | Yes |
| `TITLE_MODEL` | Model used to name chats. Default `gpt-4.1-mini`. | No |
| `TITLE_API_URL` | OpenAI-compatible base URL for naming. Default `https://api.openai.com/v1`. | No |
| `MEMORY_SEARCH_URL` | Search endpoint of the memory service your Hermes already uses (Library page). | No |
| `MEMORY_SEARCH_KEY` | Bearer key for that endpoint, if it needs one. | Yes |
| `TELNYX_API_KEY` | Your Telnyx API key. | Yes |
| `TELNYX_PUBLIC_KEY` | Your Telnyx public key (Keys & Credentials > Public Key). Used to check webhook signatures. | No |
| `TELNYX_FROM_NUMBER` | Your Telnyx number in `+15551234567` form. | No |
| `TELNYX_MESSAGING_PROFILE_ID` | Your messaging profile id, if you want sends tied to it. | No |
| `TELNYX_SENDING_ENABLED` | `true` only after your number is approved to send. Until then the app receives but never sends. | No |
| `COMPOSIO_API_KEY` | Your Composio project API key. | Yes |
| `COMPOSIO_USER_ID` | The Composio user id your Hermes uses, so linked apps are the apps your agent can use. | No |
| `DASHBOARD_PUSH_KEY` | A long random key your agent uses to post dashboard cards to `/agent/dashboard`. | Yes |
| `PORT` | Railway sets this for you. | No |

Make a strong key with: `openssl rand -hex 32`
