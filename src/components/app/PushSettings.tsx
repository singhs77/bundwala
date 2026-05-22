import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/me";
import { supabase } from "@/integrations/supabase/client";
import {
  ensureSubscription,
  isPushSupported,
  removeSubscription,
  requestPermission,
  saveSubscription,
} from "@/lib/push";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";

export function PushSettings() {
  const session = useSession();
  const [supported, setSupported] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["notification_settings"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_notification_settings");
      return data?.[0] ?? null;
    },
  });

  useEffect(() => {
    setSupported(isPushSupported());
  }, []);

  useEffect(() => {
    if (!supported) return;
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) return;
      setEndpoint(sub.endpoint);
    })();
  }, [supported]);

  if (!supported) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Notifications</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Your browser doesn't support push. On iOS, add this app to your Home Screen first.
        </p>
      </section>
    );
  }

  async function enable() {
    if (!session) return toast.error("Sign in first");
    setLoading(true);
    try {
      const perm = await requestPermission();
      if (perm === "denied") {
        throw new Error(
          "Notifications are blocked in your browser. Tap the lock icon in the address bar → Site settings → allow Notifications, then try again."
        );
      }
      if (perm !== "granted") throw new Error("Permission not granted");
      const sub = await ensureSubscription();
      await saveSubscription({
        token: session.token,
        sub,
        reminderLocalTime: null,
        enabled: true,
      });
      setEndpoint(sub.endpoint);
      toast.success("Notifications enabled");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    if (!session) return;
    setLoading(true);
    try {
      await removeSubscription(session.token);
      setEndpoint(null);
      toast.success("Notifications disabled");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Notifications</h2>
          <p className="text-xs text-muted-foreground">
            {settings?.reminder_time
              ? `Daily reminder at ${String(settings.reminder_time).slice(0, 5)} + admin broadcasts.`
              : "Daily reminder + admin broadcasts."}
          </p>
        </div>
        {endpoint ? (
          <Button variant="outline" size="sm" onClick={disable} disabled={loading}>
            <BellOff className="mr-1 h-4 w-4" />
            Disable
          </Button>
        ) : (
          <Button size="sm" onClick={enable} disabled={loading}>
            <Bell className="mr-1 h-4 w-4" />
            Enable
          </Button>
        )}
      </div>
    </section>
  );
}