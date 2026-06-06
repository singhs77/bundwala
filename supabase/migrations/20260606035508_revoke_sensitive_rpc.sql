-- Defense-in-depth: revoke EXECUTE on push-key/admin RPCs from anon & authenticated.
-- These are only invoked server-side via the service_role client.
REVOKE EXECUTE ON FUNCTION public.list_due_reminders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_reminder_sent(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_global_reminder_sent() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_subscriptions(text) FROM PUBLIC, anon, authenticated;
