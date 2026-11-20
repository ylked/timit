// Date/time helpers. The server stores naive local timestamps ("2026-11-20T13:30:00"),
// and weeks start on Monday everywhere in the app.

export const HOUR = 3600;

/** Parses a naive local ISO string as local time. */
export function parseLocal(iso: string): Date {
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
}

/** YYYY-MM-DD in local time (never toISOString, which is UTC). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DDTHH:MM:SS in local time. */
export function isoLocal(d: Date): string {
  return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function addDays(d: Date | string, n: number): Date {
  const r = typeof d === "string" ? parseLocal(d) : new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** Monday-first weekday index: 0 = Monday … 6 = Sunday. */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function today(): string {
  return isoDate(new Date());
}

// ---------- formatting ----------

/** "3h 05m" */
export function fmtDuration(seconds: number): string {
  seconds = Math.max(0, Math.round(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${pad(m)}m`;
}

/** Compact duration for tight spots: "3h", "3h05", "45m". */
export function fmtShort(seconds: number): string {
  seconds = Math.max(0, Math.round(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${pad(m)}`;
}

/** "+2h 10m", "−0h 45m", "±0h 00m" */
export function fmtSigned(seconds: number): string {
  if (Math.abs(seconds) < 60) return "±0h 00m";
  return `${seconds > 0 ? "+" : "−"}${fmtDuration(Math.abs(seconds))}`;
}

export function fmtClock(seconds: number): string {
  seconds = Math.max(0, Math.floor(seconds));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map(pad).join(":");
}

export function fmtHours(hours: number): string {
  return `${+hours.toFixed(2)}h`;
}

/** "CHF 1,234.50" in the browser's locale. */
export function fmtMoney(amount: number, currency: string, opts: { whole?: boolean } = {}): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: opts.whole ? 0 : 2,
    maximumFractionDigits: opts.whole ? 0 : 2,
  }).format(amount);
}

/** "13:30" from an ISO timestamp. */
export function fmtTime(iso: string): string {
  return iso.slice(11, 16);
}

/** Minutes after midnight → "09:45" (values ≥ 24h wrap, e.g. past-midnight ends). */
export function fmtMinutes(min: number): string {
  min = Math.round(min) % (24 * 60);
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

const locale = undefined; // the browser's locale

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return parseLocal(iso).toLocaleDateString(locale, opts);
}

export function fmtDateLong(iso: string): string {
  return fmtDate(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function fmtRange(start: string, end: string): string {
  const s = parseLocal(start);
  const e = parseLocal(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  const startStr = s.toLocaleDateString(locale, { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" });
  const endStr = e.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  return start === end ? endStr : `${startStr} – ${endStr}`;
}

export function fmtMonth(year: number, month0: number): string {
  return new Date(year, month0, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Seconds an entry contributes, clipped to [from, to) if given. Running entries end at `now`. */
export function entrySeconds(e: { start_ts: string; end_ts: string | null }, now: Date, from?: Date, to?: Date): number {
  let s = parseLocal(e.start_ts).getTime();
  let t = e.end_ts ? parseLocal(e.end_ts).getTime() : now.getTime();
  if (from) s = Math.max(s, from.getTime());
  if (to) t = Math.min(t, to.getTime());
  return Math.max(0, (t - s) / 1000);
}

/** Named date ranges used by range pickers. */
export function presetRange(name: string): { start: string; end: string } {
  const now = new Date();
  switch (name) {
    case "today":
      return { start: today(), end: today() };
    case "this-week":
      return { start: isoDate(startOfWeek(now)), end: isoDate(addDays(startOfWeek(now), 6)) };
    case "last-week": {
      const s = addDays(startOfWeek(now), -7);
      return { start: isoDate(s), end: isoDate(addDays(s, 6)) };
    }
    case "this-month":
      return { start: isoDate(startOfMonth(now)), end: isoDate(endOfMonth(now)) };
    case "last-month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: isoDate(s), end: isoDate(endOfMonth(s)) };
    }
    case "last-30":
      return { start: isoDate(addDays(now, -29)), end: today() };
    default:
      throw new Error(`Unknown preset ${name}`);
  }
}

export const PRESETS = [
  { id: "today", label: "Today" },
  { id: "this-week", label: "This week" },
  { id: "last-week", label: "Last week" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "last-30", label: "Last 30 days" },
] as const;
