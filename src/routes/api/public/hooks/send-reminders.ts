import { createFileRoute } from "@tanstack/react-router";
import { sendDueReminders } from "@/lib/push.functions";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("secret");
  if (!provided || provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

export const Route = createFileRoute("/api/public/hooks/send-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const result = await sendDueReminders();
        return Response.json(result);
      },
      GET: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const result = await sendDueReminders();
        return Response.json(result);
      },
    },
  },
});