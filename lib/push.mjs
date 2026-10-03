// Web push (works on iPhone for the app added to the Home Screen, iOS 16.4+, and on Android/desktop).
// Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in .env (generate with `npx web-push generate-vapid-keys`).
import express from 'express';
import webpush from 'web-push';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT = 'https://lcc.perchito.app' } = process.env;
const enabled = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (enabled) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
else console.warn('[push] VAPID keys not set — push notifications are off');

export function pushRoutes(pool) {
  const r = express.Router();
  r.get('/key', (req, res) => res.json({ key: enabled ? VAPID_PUBLIC_KEY : null }));
  r.post('/subscribe', async (req, res) => {
    const sub = req.body?.subscription;
    if (!enabled) return res.status(503).json({ error: 'Notifications are not set up on the server' });
    if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) return res.status(400).json({ error: 'Bad subscription' });
    // one row per phone/browser; signing in as someone else on that phone moves it to them
    await pool.query(`insert into push_subscriptions (endpoint, user_id, keys) values ($1, $2, $3)
      on conflict (endpoint) do update set user_id = excluded.user_id, keys = excluded.keys`, [sub.endpoint, req.user.id, sub.keys]);
    res.json({ ok: true });
  });
  r.post('/unsubscribe', async (req, res) => {
    await pool.query('delete from push_subscriptions where endpoint = $1 and user_id = $2', [String(req.body?.endpoint || ''), req.user.id]);
    res.json({ ok: true });
  });
  return r;
}

/**
 * Fire-and-forget: send { title, body, url, tag } to everyone matched by
 * { emails: [...] } or { role: 'admin' }, skipping the user `except`.
 * Dead subscriptions (phone uninstalled the app) are removed.
 */
export function notify(pool, { emails, role, except }, payload) {
  if (!enabled) return;
  (async () => {
    const { rows } = await pool.query(
      `select s.endpoint, s.keys from push_subscriptions s join users u on u.id = s.user_id
        where u.active and ($1::text[] is null or lower(u.email) = any($1)) and ($2::text is null or u.role = $2)
          and ($3::uuid is null or u.id <> $3)`,
      [emails ? emails.map((e) => e.toLowerCase()) : null, role || null, except || null]);
    await Promise.all(rows.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 24 * 3600, urgency: 'high' });
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await pool.query('delete from push_subscriptions where endpoint = $1', [s.endpoint]);
        else console.warn('[push] send failed', e.statusCode || e.message);
      }
    }));
    if (rows.length) console.log(`[push] "${payload.title}" -> ${rows.length} device(s)`);
  })().catch((e) => console.warn('[push]', e.message));
}
