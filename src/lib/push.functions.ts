import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendToSubs } = await import("./push.server");
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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendToSubs } = await import("./push.server");
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