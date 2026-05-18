import { useEffect, useState } from "react";

const KEY_ID = "tracker.member";
const KEY_TOKEN = "tracker.token";

export type Session = { memberId: string; token: string } | null;

export function getSession(): Session {
  if (typeof window === "undefined") return null;
  const memberId = window.localStorage.getItem(KEY_ID);
  const token = window.localStorage.getItem(KEY_TOKEN);
  if (!memberId || !token) return null;
  return { memberId, token };
}

export function setSession(s: Session) {
  if (typeof window === "undefined") return;
  if (s) {
    window.localStorage.setItem(KEY_ID, s.memberId);
    window.localStorage.setItem(KEY_TOKEN, s.token);
  } else {
    window.localStorage.removeItem(KEY_ID);
    window.localStorage.removeItem(KEY_TOKEN);
  }
  window.dispatchEvent(new Event("tracker:me"));
}

export function clearSession() {
  setSession(null);
}

/** Returns the current member id (or null). */
export function useMe(): string | null {
  return useSession()?.memberId ?? null;
}

/** Returns full session {memberId, token} or null. */
export function useSession(): Session {
  const [s, setS] = useState<Session>(null);
  useEffect(() => {
    setS(getSession());
    const h = () => setS(getSession());
    window.addEventListener("tracker:me", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("tracker:me", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return s;
}
