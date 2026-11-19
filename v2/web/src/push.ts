import { api } from "./api";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Asks permission and registers this device for Web Push. Returns a user-facing status. */
export async function enablePush(): Promise<string> {
  if (!pushSupported()) {
    return "This browser can't do push. On iPhone, add Dad League to your Home Screen first (Share → Add to Home Screen).";
  }
  const config = await api.pushConfig();
  if (!config.enabled || !config.publicKey) return "Push notifications aren't set up on this server yet.";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "Notifications are blocked. You can allow them in your browser settings.";
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey) }));
  await api.savePushSubscription(sub.toJSON());
  return "Notifications are on for this device.";
}
