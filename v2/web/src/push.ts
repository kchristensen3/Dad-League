import { api } from "./api";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Asks permission and registers this device for Web Push. */
export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  if (!pushSupported()) {
    return {
      ok: false,
      message: "This browser can't do push. On iPhone, add Dad League to your Home Screen first (Share → Add to Home Screen), then open it from there.",
    };
  }
  const config = await api.pushConfig();
  if (!config.enabled || !config.publicKey) return { ok: false, message: "Push notifications aren't set up on this server yet." };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notifications are blocked for Dad League. Allow them in your phone's Settings → Notifications, then try again." };
  }
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey) }));
  await api.savePushSubscription(sub.toJSON());
  return { ok: true, message: "Notifications are on for this device." };
}

/** Makes sure this device is registered, then asks the server to send it a test notification. */
export async function sendTestNotification(): Promise<string> {
  const enabled = await enablePush();
  if (!enabled.ok) return enabled.message;
  const r = await api.testPush();
  return r.delivered > 0
    ? `Sent to ${r.delivered} ${r.delivered === 1 ? "device" : "devices"}. It should pop up within a few seconds. If it doesn't, check Focus/Do Not Disturb.`
    : "Couldn't reach your devices. Tap “Turn on for this device” and try again.";
}
