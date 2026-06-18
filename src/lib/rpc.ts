import { toast } from "sonner";
import { clearSession } from "@/lib/me";

const FRIENDLY: Record<string, string> = {
  invalid_session: "Session expired — please log back in.",
  wrong_password: "Wrong password.",
  bad_date: "That date is out of range.",
  bad_status: "Invalid value — please check the field.",
  bad_minutes: "Invalid value — please check the field.",
  bad_value: "Invalid value — please check the field.",
  bad_water: "Invalid value — please check the field.",
  bad_hours: "Invalid value — please check the field.",
  bad_goal: "Invalid value — please check the field.",
  topic_too_long: "That entry is too long.",
  text_too_long: "That entry is too long.",
  url_too_long: "That URL is too long.",
  invalid_name: "Please enter a valid name.",
  empty_body: "Please write something first.",
  too_long: "That entry is too long.",
  password_too_short: "Password is too short.",
  password_too_long: "Password is too long.",
  no_password_set: "No password set for this member.",
  not_found: "That entry no longer exists.",
  forbidden: "You can't change someone else's entry.",
  team_not_found: "That team no longer exists.",
  demo_not_found: "Demo account isn't available right now.",
};

function extractCode(err: unknown): string {
  const msg = String((err as any)?.message ?? err ?? "");
  for (const code of Object.keys(FRIENDLY)) {
    if (msg.includes(code)) return code;
  }
  return msg;
}

/** Map a raw RPC error to a human-readable string. */
export function formatRpcError(err: unknown): string {
  const code = extractCode(err);
  return FRIENDLY[code] ?? code;
}

let handlingExpiry = false;

/** Detect an expired session, clear it, and prompt the user to log back in. */
export function handleRpcError(err: unknown): string {
  const msg = String((err as any)?.message ?? err ?? "");
  if (msg.includes("invalid_session")) {
    if (!handlingExpiry) {
      handlingExpiry = true;
      clearSession();
      toast.error("Session expired — please log back in.");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("tracker:session-expired"));
      }
      setTimeout(() => {
        handlingExpiry = false;
      }, 1000);
    }
    return "Session expired — please log back in.";
  }
  return formatRpcError(err);
}