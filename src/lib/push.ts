import { supabase } from "@/integrations/supabase/client";

export const VAPID_PUBLIC_KEY =
  "BMxeHqQ_hCcFjf9cvHlNo0kvGPxj6NMYftWudptO4HNTthZQdhxfzzAQ0p_WcTbCkCL2PWgfjHvNBhw9sa5HCTM";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function ensureSubscription(): Promise<PushSubscription> {
  const reg =
    (await navigator.serviceWorker.getRegistration("/sw.js")) ||
    (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });
  }
  return sub;
}

export async function saveSubscription(opts: {
  token: string;
  sub: PushSubscription;
  reminderLocalTime: string | null;
  enabled: boolean;
}) {
  const tzOffset = -new Date().getTimezoneOffset(); // minutes east of UTC
  const { error } = await supabase.rpc("upsert_push_subscription", {
    _token: opts.token,
    _endpoint: opts.sub.endpoint,
    _p256dh: bufferToBase64Url(opts.sub.getKey("p256dh")),
    _auth: bufferToBase64Url(opts.sub.getKey("auth")),
    _reminder_local_time: (opts.reminderLocalTime || null) as any,
    _tz_offset_minutes: tzOffset,
    _enabled: opts.enabled,
  });
  if (error) throw error;
}

export async function removeSubscription(token: string) {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc("delete_push_subscription", {
    _token: token,
    _endpoint: sub.endpoint,
  });
  await sub.unsubscribe();
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (Notification.permission === "granted") return "granted";
  return await Notification.requestPermission();
}