import { createFileRoute } from "@tanstack/react-router";
import { sendDueReminders } from "@/lib/push.functions";

export const Route = createFileRoute("/api/public/hooks/send-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const result = await sendDueReminders();
        return Response.json(result);
      },
      GET: async () => {
        const result = await sendDueReminders();
        return Response.json(result);
      },
    },
  },
});