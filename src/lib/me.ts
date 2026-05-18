import { useEffect, useState } from "react";

const KEY = "tracker.member";

export function getStoredMemberId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setStoredMemberId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(KEY, id);
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("tracker:me"));
}

export function useMe() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(getStoredMemberId());
    const h = () => setId(getStoredMemberId());
    window.addEventListener("tracker:me", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("tracker:me", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return id;
}
