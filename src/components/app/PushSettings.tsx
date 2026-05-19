import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";

export function PushSettings() {
  const session = useSession();
  const [supported, setSupported] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [reminderTime, setReminderTime] = useState("20:00");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

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
      const { data } = await supabase
        .from("push_subscriptions")
        .select("reminder_local_time, enabled")
        .eq("endpoint", sub.endpoint)
        .maybeSingle();
      if (data?.reminder_local_time) setReminderTime(data.reminder_local_time.slice(0, 5));
      if (data?.enabled !== undefined && data.enabled !== null) setEnabled(data.enabled);
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
      if (perm !== "granted") throw new Error("Permission denied");
      const sub = await ensureSubscription();
      await saveSubscription({
        token: session.token,
        sub,
        reminderLocalTime: reminderTime,
        enabled: true,
      });
      setEndpoint(sub.endpoint);
      setEnabled(true);
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

  async function saveTime() {
    if (!session) return;
    setLoading(true);
    try {
      const sub = await ensureSubscription();
      await saveSubscription({
        token: session.token,
        sub,
        reminderLocalTime: reminderTime,
        enabled,
      });
      toast.success("Saved");
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
            Daily reminder + admin broadcasts.
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
      {endpoint && (
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="rt">Daily reminder time</Label>
            <Input
              id="rt"
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={saveTime} disabled={loading}>
            Save
          </Button>
        </div>
      )}
    </section>
  );
}