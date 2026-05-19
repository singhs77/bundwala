import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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

async function sendToSubs(
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

export const sendAdminBroadcast = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        password: z.string().min(1),
        title: z.string().min(1).max(80),
        body: z.string().min(1).max(300),
        url: z.string().max(500).optional(),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { data: subs, error } = await supabaseAdmin.rpc("admin_list_subscriptions", {
      _password: data.password,
    });
    if (error) throw new Error(error.message);
    const result = await sendToSubs(subs ?? [], {
      title: data.title,
      body: data.body,
      url: data.url,
    });
    return result;
  });

export const sendDueReminders = createServerFn({ method: "POST" }).handler(async () => {
  const { data: subs, error } = await supabaseAdmin.rpc("list_due_reminders");
  if (error) throw new Error(error.message);
  if (!subs || subs.length === 0) return { sent: 0, failed: 0, due: 0 };
  const result = await sendToSubs(subs, {
    title: "Daily check-in",
    body: "Don't forget to log gym and macros today.",
    url: "/",
  });
  for (const s of subs) {
    await supabaseAdmin.rpc("mark_reminder_sent", { _id: s.id });
  }
  return { ...result, due: subs.length };
});