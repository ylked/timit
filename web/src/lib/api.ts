// Typed client for the Flask API in app.py.

export interface Entry {
  id: number;
  start_ts: string; // local ISO, no timezone
  end_ts: string | null;
  note: string;
}

export interface TimerStatus {
  running: boolean;
  entry?: Entry;
  now: string;
}

export interface QuotaSettings {
  weekly_hours: number;
  start_date: string;
  start_date_is_default: boolean;
}

export interface QuotaWeek {
  week_start: string;
  seconds: number;
  quota_hours: number | null;
  is_override: boolean;
  note: string;
  state: "past" | "current" | "future";
  balance_after?: number;
}

export interface Balance {
  settings: QuotaSettings;
  balance_seconds: number;
  worked_seconds: number;
  quota_seconds: number;
  current_week: QuotaWeek;
}

export interface Period {
  id: number;
  start_date: string;
  end_date: string;
  exported_at: string;
  seconds: number;
  current_seconds: number;
  note: string;
}

export interface PeriodState {
  periods: Period[];
  unsubmitted: { seconds: number; start: string | null; end: string | null };
  suggested: { start: string; end: string } | null;
}

export interface Insights {
  empty: false;
  first_day: string;
  total_seconds: number;
  days: { date: string; seconds: number }[];
  weeks: QuotaWeek[];
  months: { month: string; seconds: number }[];
  weekdays: { weekday: number; seconds: number; days_worked: number; avg_seconds: number }[];
  heatmap: number[][]; // [weekday 0=Mon][hour]
  sessions: {
    count: number;
    avg_seconds: number;
    median_seconds: number;
    longest: { id: number; start: string; end: string; seconds: number } | null;
  };
  days_worked: number;
  avg_day_seconds: number;
  avg_week_seconds: number;
  typical_start_minutes: number;
  typical_end_minutes: number;
  earliest_start: { date: string; minutes: number };
  latest_end: { date: string; minutes: number };
  best_day: { date: string; seconds: number };
  best_week: { week_start: string; seconds: number };
  quota_streak: { current: number; best: number };
}

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`);
  return data as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

const range = (start?: string, end?: string) => {
  const p = new URLSearchParams();
  if (start) p.set("start", start);
  if (end) p.set("end", end);
  return p.toString();
};

export const api = {
  timerStatus: () => request<TimerStatus>("/api/timer/status"),
  timerStart: (note: string, start_ts?: string) => request<Entry>("/api/timer/start", json("POST", { note, start_ts })),
  timerStop: () => request<Entry>("/api/timer/stop", json("POST")),

  entries: (start: string, end: string) => request<Entry[]>(`/api/entries?${range(start, end)}`),
  createEntry: (e: Omit<Entry, "id">) => request<Entry>("/api/entries", json("POST", e)),
  updateEntry: (id: number, e: Partial<Omit<Entry, "id">>) => request<Entry>(`/api/entries/${id}`, json("PUT", e)),
  deleteEntry: (id: number) => request<{ ok: true }>(`/api/entries/${id}`, json("DELETE")),
  notes: () => request<{ note: string; last_used: string; uses: number }[]>("/api/notes"),

  daySummary: (start: string, end: string) =>
    request<{ date: string; seconds: number }[]>(`/api/summary/day?${range(start, end)}`),

  quotaSettings: () => request<QuotaSettings>("/api/quota/settings"),
  saveQuotaSettings: (s: { weekly_hours: number; start_date: string | null }) =>
    request<QuotaSettings>("/api/quota/settings", json("PUT", s)),
  quotaWeeks: (start: string, end: string) => request<QuotaWeek[]>(`/api/quota/weeks?${range(start, end)}`),
  setWeekQuota: (week: string, hours: number, note: string) =>
    request<QuotaWeek>(`/api/quota/weeks/${week}`, json("PUT", { hours, note })),
  resetWeekQuota: (week: string) => request<QuotaWeek>(`/api/quota/weeks/${week}`, json("DELETE")),
  balance: () => request<Balance>("/api/quota/balance"),

  periods: () => request<PeriodState>("/api/periods"),
  createPeriod: (p: Partial<Period>) => request<Period>("/api/periods", json("POST", p)),
  updatePeriod: (id: number, p: Partial<Period> & { resync?: boolean }) =>
    request<Period>(`/api/periods/${id}`, json("PUT", p)),
  deletePeriod: (id: number) => request<{ ok: true }>(`/api/periods/${id}`, json("DELETE")),

  insights: () => request<Insights | { empty: true }>("/api/insights"),

  exportUrl: (kind: "xlsx" | "csv" | "json", start?: string, end?: string) => `/api/export/${kind}?${range(start, end)}`,
  backupUrl: "/api/backup",
};
