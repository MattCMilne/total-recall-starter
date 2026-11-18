// Smart chat names.
// Step 1: a new chat takes the first few words of your first message as its name.
// Step 2: once your agent has replied, a small model suggests a short topic name (3 to 5 words).
// Step 3: after about five back-and-forths it takes one more look, since topics drift.
// It runs after the reply is saved, so it never slows chat down. If you rename a chat yourself,
// your name sticks forever. This is the only direct model call in the app, and it only writes titles.
// With no TITLE_API_KEY or OPENAI_API_KEY set, chats simply keep their step-1 names.
import { one, many, q } from './db.js';

const SECOND_PASS_AT = 10; // messages, about five exchanges
const INSTRUCTION = [
  'Give this conversation a short label for a list of saved chats.',
  'Answer with the label and nothing else.',
  'Use 3 to 5 words in Title Case. No quotation marks, emoji or ending punctuation.',
  'Describe the topic (good: "Spring Promo Email Draft", "Hiring A Bookkeeper", "Q3 Revenue Review").',
  'Do not copy the opening sentence or start with words like Help, Question, Asking or Request.',
].join(' ');

export function firstMessageTitle(text) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 7).join(' ');
  return (words.length > 48 ? words.slice(0, 48).trim() + '…' : words) || 'New chat';
}

export function cleanTitle(raw) {
  let t = String(raw || '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
  t = t.replace(/[*_`#"“”‘’]/g, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(title|name|chat name)\s*[:\-]\s*/i, '').replace(/[.!?,;:]+$/g, '').trim();
  if (!t) return null;
  const words = t.split(' ');
  if (words.length > 8 || t.length > 60) return null;
  return words.slice(0, 6).join(' ');
}

async function askForTitle(excerpt) {
  const apiKey = process.env.TITLE_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const url = (process.env.TITLE_API_URL || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.TITLE_MODEL || 'gpt-4.1-mini',
        temperature: 0.2,
        max_tokens: 24,
        messages: [{ role: 'system', content: INSTRUCTION }, { role: 'user', content: `Chat excerpt:\n\n${excerpt}\n\nName:` }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return cleanTitle(json.choices?.[0]?.message?.content);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Call without awaiting, after an assistant reply is saved. */
export async function retitleInBackground(conversationId) {
  try {
    const conv = await one('SELECT id, title, title_set_by_owner, auto_title_stage FROM conversations WHERE id = $1', [conversationId]);
    if (!conv || conv.title_set_by_owner) return;
    const msgs = await many(
      `SELECT role, content FROM messages WHERE conversation_id = $1 AND status = 'done' AND content <> '' ORDER BY created_at`, [conversationId]);
    const stage = conv.auto_title_stage;
    const due = (stage === 0 && msgs.length >= 2) || (stage === 1 && msgs.length >= SECOND_PASS_AT);
    if (!due) return;
    const picked = stage === 0 ? msgs.slice(0, 4) : [...msgs.slice(0, 2), ...msgs.slice(-6)];
    const excerpt = picked.map((m) => `${m.role === 'user' ? 'Person' : 'Assistant'}: ${m.content.slice(0, 600)}`).join('\n\n');
    const title = await askForTitle(excerpt);
    // Re-check: the owner may have renamed the chat while we waited.
    await q(
      `UPDATE conversations SET title = COALESCE($2, title), auto_title_stage = $3
       WHERE id = $1 AND title_set_by_owner = false AND title = $4`,
      [conversationId, title, stage + 1, conv.title]);
  } catch (err) {
    console.error('[titles] skipped:', err.message);
  }
}
