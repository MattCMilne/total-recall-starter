# Make it yours

Start with what you can change in the app itself. Ask your builder for code changes only after that.

## In the app (no code)

Open **Settings** from the account menu at the bottom of the sidebar.

- **App name:** what shows on the sidebar and the browser tab.
- **Agent name:** shown in chat ("Message Nova…") and on the agent avatar.
- **Logo letters:** up to 3 letters in the logo square.
- **Accent colour:** buttons, highlights and the logo.
- **Theme:** system, light or dark.
- **Time zone:** used in the note your agent gets with each message.
- **Home page:** where you land after signing in.
- **Menu:** rename, reorder or hide any page. **Add a page** gives you a Markdown page (handy for SOPs, offers and checklists). **Add a link** opens an outside tool in a new tab.

Everything saves to your database, so it survives reloads and redeploys.

## Dashboard cards from your agent

Ask your Hermes to post cards. Paste this to your agent, filling in the brackets:

> Every weekday at 7am my time, build a short card for my Total Recall dashboard: [what you want to see, for example: new leads since yesterday, with names]. Use only real records you can check, and cite the source in the card's "source" field. Post it to [my app URL]/agent/dashboard with the bearer key stored as DASHBOARD_PUSH_KEY in your environment. If you can't reach a source, post the card with status "needs_source" and say what's missing. Never put keys, passwords or private message text in a card.

Good first cards answer a question you'd otherwise ask every morning. Three to five cards is plenty, and each one should change a decision.

## With your builder (code)

Ask for one change at a time and test it on your phone. Here are some good next changes:

- **A real logo image** instead of letters. Put it in `public/` and show it in the sidebar and sign-in page.
- **Your own fonts.** Change `--font` at the top of `public/app.css`.
- **A custom page with live data**, for example a leads board from your CRM through your agent. Keep the rule: real records or an honest "needs a source".
- **File uploads in chat.** Hermes accepts images through its API. Add a Railway volume for files, and serve them only to you.
- **Voice.** Keep your Hermes as the one that does the work: voice only listens and speaks, and every request goes into the same chat.

Before any change ships: no keys in browser code, owner checks on every new route, new tables added to `server/schema.sql`, and a check on your phone.
