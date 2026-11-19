const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const monthShort = (d: Date) => MONTHS[d.getMonth()];
export const monthLong = (d: Date) => MONTHS_LONG[d.getMonth()];
export const dayShort = (d: Date) => DAYS[d.getDay()];

export function time(d: Date) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** "Sun 22 Nov · 2:00 pm" */
export const dayDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${dayShort(d)} ${d.getDate()} ${monthShort(d)} · ${time(d)}`;
};

/** "SAT 14 NOV" */
export const dayDateUpper = (iso: string) => {
  const d = new Date(iso);
  return `${dayShort(d)} ${d.getDate()} ${monthShort(d)}`.toUpperCase();
};

export const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${monthShort(d)} ${d.getFullYear()}`;
};

export function timeAgo(iso: string) {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return shortDate(iso);
}

export function minutesAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h} h ago`;
}

/** 2712 → "45 min"; 4000 → "1 h 7 min" */
export function duration(seconds: number | null | undefined) {
  if (!seconds) return "";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** 754 → "12:34" */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const LANGUAGE_NAMES: Record<string, string> = { en: "English", fr: "Français", pt: "Português", es: "Español" };
