// App-wide reactive state (Svelte 5 runes).
import { api, type Entry } from "./api";
import { fmtClock, isoLocal, parseLocal } from "./time";

// ---------- clock ----------
// One shared ticking clock so every live duration on screen updates together.
export const clock = $state({ now: new Date() });
setInterval(() => (clock.now = new Date()), 1000);

// ---------- data version ----------
// Views refetch when this changes; bump it after any mutation.
export const data = $state({ version: 0 });
export function invalidate() {
  data.version++;
}

// ---------- timer ----------
export const timer = $state({
  loaded: false,
  entry: null as Entry | null,
  /** server clock minus client clock, in ms */
  skewMs: 0,
  busy: false,
  /** note typed into the timer before starting */
  draft: "",
});

export function timerElapsed(): number {
  if (!timer.entry) return 0;
  const serverNow = clock.now.getTime() + timer.skewMs;
  return (serverNow - parseLocal(timer.entry.start_ts).getTime()) / 1000;
}

/** "Now" in server-local time, for computing durations of running entries. */
export function serverNow(): Date {
  return new Date(clock.now.getTime() + timer.skewMs);
}

export async function refreshTimer() {
  const status = await api.timerStatus();
  timer.skewMs = parseLocal(status.now).getTime() - Date.now();
  timer.entry = status.running ? status.entry! : null;
  timer.loaded = true;
}

export async function startTimer(note: string, minutesAgo = 0) {
  if (timer.busy) return;
  timer.busy = true;
  try {
    const start = minutesAgo ? isoLocal(new Date(serverNow().getTime() - minutesAgo * 60_000)) : undefined;
    timer.entry = await api.timerStart(note.trim(), start);
    invalidate();
  } catch (e) {
    toast.error(e);
  } finally {
    timer.busy = false;
  }
}

export async function stopTimer() {
  if (timer.busy) return;
  timer.busy = true;
  try {
    const entry = await api.timerStop();
    timer.entry = null;
    const secs = (parseLocal(entry.end_ts!).getTime() - parseLocal(entry.start_ts).getTime()) / 1000;
    toast.show(`Stopped after ${fmtClock(secs)}${entry.note ? ` · ${entry.note}` : ""}`);
    invalidate();
  } catch (e) {
    toast.error(e);
    await refreshTimer();
  } finally {
    timer.busy = false;
  }
}

export function toggleTimer() {
  if (timer.entry) return stopTimer();
  const note = timer.draft;
  timer.draft = "";
  return startTimer(note);
}

// Keep the tab title live while the timer runs, so it's visible from other tabs.
$effect.root(() => {
  $effect(() => {
    document.title = timer.entry ? `▶ ${fmtClock(timerElapsed()).slice(0, 5)} · Timit` : "Timit";
  });
});

// Re-sync when coming back to the tab (another device or tab may have changed the timer).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshTimer().catch(() => {});
    invalidate();
  }
});

// ---------- toasts ----------
export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error";
  action?: { label: string; run: () => void | Promise<void> };
}

let toastSeq = 0;
export const toasts = $state<Toast[]>([]);

export const toast = {
  show(message: string, opts: { action?: Toast["action"]; kind?: Toast["kind"]; timeout?: number } = {}) {
    const t: Toast = { id: ++toastSeq, message, kind: opts.kind ?? "info", action: opts.action };
    toasts.push(t);
    const timeout = opts.timeout ?? (t.action ? 8000 : 4000);
    setTimeout(() => toast.dismiss(t.id), timeout);
    return t.id;
  },
  error(e: unknown) {
    toast.show(e instanceof Error ? e.message : String(e), { kind: "error", timeout: 6000 });
  },
  dismiss(id: number) {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  },
};

// ---------- note suggestions (rendered as one shared <datalist id="note-suggestions">) ----------
export const notes = $state({
  list: [] as string[],
  async load() {
    try {
      notes.list = (await api.notes()).map((n) => n.note);
    } catch {
      // Suggestions are optional.
    }
  },
});

// ---------- entry editing (one shared dialog) ----------
export const entryEditor = $state({
  open: false,
  entry: null as Entry | null,
  /** default date for a new entry */
  date: null as string | null,
});

export function editEntry(entry: Entry | null, date: string | null = null) {
  entryEditor.entry = entry;
  entryEditor.date = date;
  entryEditor.open = true;
}

/** Deletes an entry with an Undo toast (re-creates it). */
export async function deleteEntry(entry: Entry) {
  try {
    await api.deleteEntry(entry.id);
    if (timer.entry?.id === entry.id) timer.entry = null;
    invalidate();
    toast.show("Entry deleted", {
      action: {
        label: "Undo",
        run: async () => {
          const restored = await api.createEntry({ start_ts: entry.start_ts, end_ts: entry.end_ts, note: entry.note });
          if (!restored.end_ts) timer.entry = restored;
          invalidate();
        },
      },
    });
  } catch (e) {
    toast.error(e);
  }
}
