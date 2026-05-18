export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 Sun .. 6 Sat. Week starts Sunday to match sheet.
  x.setDate(x.getDate() - day);
  return x;
}
export function endOfWeek(d: Date): Date {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return e;
}
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
export function daysOfWeek(d: Date): Date[] {
  const s = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(s);
    x.setDate(s.getDate() + i);
    return x;
  });
}
export function shiftWeek(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + delta * 7);
  return x;
}
export function formatRange(d: Date): string {
  const s = startOfWeek(d);
  const e = endOfWeek(d);
  const fmt = (x: Date) => `${x.getMonth() + 1}/${x.getDate()}`;
  return `${fmt(s)} – ${fmt(e)}`;
}
