import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PUBLIC_VAPID =
  "BMxeHqQ_hCcFjf9cvHlNo0kvGPxj6NMYftWudptO4HNTthZQdhxfzzAQ0p_WcTbCkCL2PWgfjHvNBhw9sa5HCTM";

async function getWebPush() {
  const mod = await import("web-push");
  const wp = (mod as any).default ?? mod;
  wp.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    PUBLIC_VAPID,
    process.env.VAPID_PRIVATE_KEY!
  );
  return wp;
}

export async function sendToSubs(
  subs: Array<{ id?: string; endpoint: string; p256dh: string; auth: string }>,
  payload: { title: string; body: string; url?: string }
) {
  const wp = await getWebPush();
  const json = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    try {
      await wp.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        json
      );
      sent++;
    } catch (err: any) {
      failed++;
      const status = err?.statusCode;
      if (status === 404 || status === 410) {
        await supabaseAdmin.rpc("delete_push_subscription_by_endpoint", {
          _endpoint: s.endpoint,
        });
      } else {
        console.error("[push] send failed", status, err?.body);
      }
    }
  }
  return { sent, failed };
}