// Business texting through YOUR Telnyx number.
// Docs: https://developers.telnyx.com/docs/messaging/messages/send-message
//       https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks
// Rules: verify the webhook signature, save the event once (unique id), then answer 200.
// Statuses never go backwards. STOP is respected. Sending stays off until the number is ready.
import crypto from 'node:crypto';
import { one, q } from './db.js';

const RANK = { queued: 1, sending: 2, sent: 3, delivered: 5, sending_failed: 5, delivery_failed: 5, delivery_unconfirmed: 4, received: 5 };
const STOP_WORDS = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i;
const START_WORDS = /^\s*(start|unstop|yes)\s*$/i;

export function telnyxStatus() {
  const missing = ['TELNYX_API_KEY', 'TELNYX_PUBLIC_KEY', 'TELNYX_FROM_NUMBER'].filter((k) => !process.env[k]);
  if (missing.length) return { state: 'not_connected', detail: `Add ${missing.join(', ')} to finish setup.` };
  if (process.env.TELNYX_SENDING_ENABLED !== 'true') {
    return { state: 'pending', detail: 'Receiving is on. Sending stays off until your number is approved (set TELNYX_SENDING_ENABLED=true).' };
  }
  return { state: 'connected', detail: `Texts from ${process.env.TELNYX_FROM_NUMBER}` };
}

export function isE164(v) { return /^\+[1-9]\d{7,14}$/.test(String(v || '')); }

/** Ed25519 check over "{timestamp}|{raw body}". Rejects anything older than 5 minutes. */
export function verifySignature(rawBody, signature, timestamp) {
  const pub = process.env.TELNYX_PUBLIC_KEY;
  if (!pub || !signature || !timestamp) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  try {
    const raw = Buffer.from(pub, 'base64');
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]);
    const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(`${timestamp}|${rawBody}`), key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

/** Webhook handler body. The owner is the single account this app serves (OWNER_EMAIL or first user). */
export async function handleWebhook(ownerId, event) {
  const data = event?.data;
  if (!data?.id || !data?.event_type) return 'ignored';
  const fresh = await one(
    `INSERT INTO webhook_events (provider, event_id) VALUES ('telnyx', $1) ON CONFLICT DO NOTHING RETURNING event_id`, [data.id]);
  if (!fresh) return 'duplicate';
  const p = data.payload || {};
  if (data.event_type === 'message.received') {
    const from = p.from?.phone_number;
    if (!isE164(from)) return 'ignored';
    await q(
      `INSERT INTO sms_messages (user_id, provider_id, direction, peer, body, status, status_rank)
       VALUES ($1, $2, 'inbound', $3, $4, 'received', 5) ON CONFLICT (provider_id) DO NOTHING`,
      [ownerId, p.id, from, String(p.text || '').slice(0, 5000)]);
    if (STOP_WORDS.test(p.text || '')) {
      await q(`INSERT INTO sms_optouts (user_id, peer) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [ownerId, from]);
    } else if (START_WORDS.test(p.text || '')) {
      await q(`DELETE FROM sms_optouts WHERE user_id = $1 AND peer = $2`, [ownerId, from]);
    }
    return 'saved';
  }
  if (data.event_type === 'message.sent' || data.event_type === 'message.finalized') {
    const status = p.to?.[0]?.status || (data.event_type === 'message.sent' ? 'sent' : 'delivery_unconfirmed');
    const rank = RANK[status] ?? 3;
    const error = Array.isArray(p.errors) && p.errors.length ? String(p.errors[0]?.detail || p.errors[0]?.title || 'failed').slice(0, 300) : null;
    // Only move forward: a late "sent" never overwrites "delivered".
    await q(
      `UPDATE sms_messages SET status = $2, status_rank = $3, error = COALESCE($4, error), updated_at = now()
       WHERE provider_id = $1 AND status_rank < $3`, [p.id, status, rank, error]);
    return 'updated';
  }
  return 'ignored';
}

export async function sendText(userId, to, text, clientRequestId) {
  if (process.env.TELNYX_SENDING_ENABLED !== 'true') return { status: 409, body: { error: 'Sending is off until your number is approved.' } };
  if (!isE164(to)) return { status: 400, body: { error: 'Use a full number like +15551234567.' } };
  const body = String(text || '').trim();
  if (!body || body.length > 1600) return { status: 400, body: { error: 'Write a message up to 1,600 characters.' } };
  if (await one('SELECT 1 FROM sms_optouts WHERE user_id = $1 AND peer = $2', [userId, to])) {
    return { status: 409, body: { error: 'This person texted STOP. You cannot text them until they text START.' } };
  }
  const reqId = /^[A-Za-z0-9_-]{8,80}$/.test(clientRequestId || '') ? clientRequestId : crypto.randomUUID();
  // Write the intent first. A retry with the same request id never sends twice.
  const row = await one(
    `INSERT INTO sms_messages (user_id, client_request_id, direction, peer, body, status, status_rank)
     VALUES ($1, $2, 'outbound', $3, $4, 'queued', 1) ON CONFLICT (client_request_id) DO NOTHING RETURNING *`,
    [userId, reqId, to, body]);
  if (!row) return { status: 409, body: { error: 'This message was already sent. Refresh to see it.' } };
  let res;
  try {
    res = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.TELNYX_FROM_NUMBER,
        to,
        text: body,
        ...(process.env.TELNYX_MESSAGING_PROFILE_ID ? { messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID } : {}),
      }),
    });
  } catch {
    // Unknown outcome: do not resend automatically.
    await q(`UPDATE sms_messages SET status = 'delivery_unconfirmed', status_rank = 4, error = 'Lost connection while sending. Check Telnyx before resending.' WHERE id = $1`, [row.id]);
    return { status: 502, body: { error: 'Lost connection while sending. Check before resending.' } };
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = String(json?.errors?.[0]?.detail || `Telnyx refused the message (HTTP ${res.status}).`).slice(0, 300);
    await q(`UPDATE sms_messages SET status = 'sending_failed', status_rank = 5, error = $2 WHERE id = $1`, [row.id, error]);
    return { status: 502, body: { error } };
  }
  await q(`UPDATE sms_messages SET provider_id = $2, status = 'sending', status_rank = 2 WHERE id = $1`, [row.id, json?.data?.id || null]);
  await q(`INSERT INTO audit_log (user_id, action, target) VALUES ($1, 'sms.send', $2)`, [userId, to]);
  return { status: 202, body: { ok: true, id: row.id } };
}
