// Push notifications on this phone/browser. iPhones only allow them for the app added to the
// Home Screen (iOS 16.4+); Android and desktop browsers allow them in the browser too.
import { api } from './store.js?v=__V__';

const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const supported = () => !!navigator.serviceWorker && 'PushManager' in window && 'Notification' in window;

/** 'on' | 'off' | 'denied' | 'install' (iPhone: add to Home Screen first) | 'unsupported' */
export async function pushState() {
  if (ios && !standalone()) return 'install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) && Notification.permission === 'granted' ? 'on' : 'off';
}

const keyBytes = (b64) => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };

/** Must be called from a tap (browsers only ask for permission after a user action). */
export async function enablePush() {
  if (await Notification.requestPermission() !== 'granted') throw new Error('Las notificaciones están bloqueadas — permítelas en Ajustes para esta app.');
  const { key } = await api('/api/push/key');
  if (!key) throw new Error('Las notificaciones aún no están configuradas en el servidor.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
}

export async function disablePush() {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** After sign-in: make sure this phone's existing subscription points at the person now signed in. */
export async function refreshPush() {
  try {
    if ((await pushState()) !== 'on') return;
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  } catch { /* offline: next time */ }
}
