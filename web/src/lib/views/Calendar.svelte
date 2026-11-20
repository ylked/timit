<script lang="ts">
  import { api, type Balance, type Entry, type Period, type QuotaWeek } from "../api";
  import { data, editEntry, serverNow } from "../state.svelte";
  import { navigate } from "../router.svelte";
  import {
    addDays, entrySeconds, fmtDateLong, fmtDuration, fmtHours, fmtMonth, fmtShort, fmtSigned, isoDate, startOfWeek, today, WEEKDAYS_SHORT, HOUR,
  } from "../time";
  import WeekDialog from "../components/WeekDialog.svelte";
  import DayTimeline from "../components/DayTimeline.svelte";
  import EntryList from "../components/EntryList.svelte";

  const now = new Date();
  let year = $state(now.getFullYear());
  let month = $state(now.getMonth()); // 0-11
  let selected = $state<string | null>(today());

  let totals = $state<Record<string, number>>({});
  let weeks = $state<QuotaWeek[]>([]);
  let periods = $state<Period[]>([]);
  let balance = $state<Balance | null>(null);
  let dayEntries = $state<Entry[]>([]);

  let weekDialog = $state(false);
  let editingWeek = $state<QuotaWeek | null>(null);

  const gridStart = $derived(startOfWeek(new Date(year, month, 1)));
  const gridEnd = $derived(addDays(startOfWeek(new Date(year, month + 1, 0)), 6));
  const rows = $derived.by(() => {
    const out: string[][] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 7)) out.push(Array.from({ length: 7 }, (_, i) => isoDate(addDays(d, i))));
    return out;
  });

  $effect(() => {
    data.version;
    const [s, e] = [isoDate(gridStart), isoDate(gridEnd)];
    Promise.all([api.daySummary(s, e), api.quotaWeeks(s, e), api.periods(), api.balance()]).then(([days, w, p, b]) => {
      totals = Object.fromEntries(days.map((d) => [d.date, d.seconds]));
      weeks = w;
      periods = p.periods;
      balance = b;
    });
  });

  $effect(() => {
    data.version;
    if (selected) api.entries(selected, selected).then((e) => (dayEntries = e.toSorted((a, b) => a.start_ts.localeCompare(b.start_ts))));
  });

  const weekBy = $derived(Object.fromEntries(weeks.map((w) => [w.week_start, w])));
  const isSubmitted = (d: string) => periods.some((p) => p.start_date <= d && d <= p.end_date);
  const monthStr = $derived(`${year}-${String(month + 1).padStart(2, "0")}`);
  const monthTotal = $derived(Object.entries(totals).reduce((s, [d, v]) => (d.startsWith(monthStr) ? s + v : s), 0));
  const daysWorked = $derived(Object.entries(totals).filter(([d, v]) => d.startsWith(monthStr) && v >= 60).length);

  function level(secs: number) {
    if (secs < 60) return 0;
    return Math.min(5, Math.ceil(secs / (2 * HOUR)));
  }

  type Status = { key: string; icon: string; label: string };
  function status(w: QuotaWeek | undefined): Status {
    if (!w || w.quota_hours === null) return { key: "none", icon: "", label: "no quota" };
    const q = w.quota_hours * HOUR;
    if (q === 0) return { key: "off", icon: "☾", label: w.note || "off" };
    if (w.state === "future") return { key: "future", icon: "", label: `/ ${fmtHours(w.quota_hours)}` };
    if (w.seconds >= q - 60) return { key: "good", icon: "✓", label: `/ ${fmtHours(w.quota_hours)}` };
    if (w.state === "current") return { key: "progress", icon: "…", label: `/ ${fmtHours(w.quota_hours)}` };
    return { key: "bad", icon: "↓", label: `/ ${fmtHours(w.quota_hours)}` };
  }

  function move(delta: number) {
    const d = new Date(year, month + delta, 1);
    year = d.getFullYear();
    month = d.getMonth();
  }
  function goToday() {
    year = now.getFullYear();
    month = now.getMonth();
    selected = today();
  }

  function openWeek(w: QuotaWeek | undefined) {
    if (!w) return;
    editingWeek = w;
    weekDialog = true;
  }

  // Arrow keys move the selected day (and month) when the grid has focus.
  function onGridKey(e: KeyboardEvent) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step || !selected) return;
    e.preventDefault();
    const next = addDays(selected, step);
    selected = isoDate(next);
    if (next.getMonth() !== month || next.getFullYear() !== year) {
      year = next.getFullYear();
      month = next.getMonth();
    }
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-day="${selected}"]`)?.focus());
  }
</script>

<div class="page">
  <div class="page-head">
    <div>
      <h1 tabindex="-1">{fmtMonth(year, month)}</h1>
      <p class="sub"><span class="num">{fmtDuration(monthTotal)}</span> on {daysWorked} day{daysWorked === 1 ? "" : "s"}</p>
    </div>
    <div class="row">
      <button class="btn icon" aria-label="Previous month" onclick={() => move(-1)}>‹</button>
      <button class="btn" onclick={goToday}>Today</button>
      <button class="btn icon" aria-label="Next month" onclick={() => move(1)}>›</button>
    </div>
  </div>

  {#if balance}
    <div class="card quota-bar">
      <div>
        <span class="muted small">Balance</span>
        <strong class="num" class:good={balance.balance_seconds >= 60} class:bad={balance.balance_seconds <= -60}>{fmtSigned(balance.balance_seconds)}</strong>
        <span class="muted small">since {fmtDateLong(balance.settings.start_date)}, completed weeks</span>
      </div>
      <div>
        <span class="muted small">Default quota</span>
        <strong class="num">{fmtHours(balance.settings.weekly_hours)}</strong><span class="muted small">/ week</span>
      </div>
      <button class="btn sm" onclick={() => navigate("settings")}>⚙ Quota settings</button>
    </div>
  {/if}

  <div class="layout">
    <section class="card cal" aria-label="Month calendar">
      <div class="grid" role="grid" tabindex="-1" onkeydown={onGridKey}>
        <div class="head" role="row">
          {#each WEEKDAYS_SHORT as d}<span role="columnheader">{d}</span>{/each}
          <span role="columnheader" class="wk">Week</span>
        </div>
        {#each rows as row (row[0])}
          {@const w = weekBy[row[0]]}
          {@const st = status(w)}
          <div class="week" role="row">
            {#each row as d (d)}
              {@const secs = totals[d] ?? 0}
              <button
                role="gridcell"
                data-day={d}
                class="day lvl-{level(secs)}"
                class:other={!d.startsWith(monthStr)}
                class:today={d === today()}
                class:selected={d === selected}
                tabindex={d === selected ? 0 : -1}
                aria-selected={d === selected}
                aria-label="{fmtDateLong(d)}: {secs >= 60 ? fmtDuration(secs) : 'nothing tracked'}{isSubmitted(d) ? ', submitted to HR' : ''}"
                onclick={() => (selected = d)}
                ondblclick={() => editEntry(null, d)}
              >
                <span class="num-day">{Number(d.slice(8))}</span>
                {#if isSubmitted(d)}<span class="sub-mark" aria-hidden="true" title="Submitted to HR">✓</span>{/if}
                <span class="hours num">{secs >= 60 ? fmtShort(secs) : ""}</span>
              </button>
            {/each}
            <button role="gridcell" class="week-cell st-{st.key}" onclick={() => openWeek(w)} aria-label="Week quota: worked {fmtDuration(w?.seconds ?? 0)} {st.label}. Edit quota">
              <span class="worked num">{w && w.seconds >= 60 ? fmtShort(w.seconds) : "—"}</span>
              <span class="quota">{#if st.icon}<span class="st-icon" aria-hidden="true">{st.icon}</span>{/if}{st.label}{w?.is_override && st.key !== "off" ? " ✎" : ""}</span>
            </button>
          </div>
        {/each}
      </div>
      <div class="legend small muted">
        <span>Less</span>
        {#each [0, 1, 2, 3, 4, 5] as l}<span class="swatch lvl-{l}" aria-hidden="true"></span>{/each}
        <span>More (2h steps)</span>
        <span class="sep"></span>
        <span><span class="good">✓</span> quota met</span>
        <span><span class="bad">↓</span> under</span>
        <span>☾ off</span>
        <span>✓ on a day: submitted to HR</span>
      </div>
    </section>

    <aside class="card detail" aria-live="polite">
      {#if selected}
        {@const secs = dayEntries.reduce((s, e) => s + entrySeconds(e, serverNow(), new Date(`${selected}T00:00:00`), addDays(selected!, 1)), 0)}
        <header>
          <div>
            <h2>{fmtDateLong(selected)}</h2>
            <p class="num">{fmtDuration(secs)}{isSubmitted(selected) ? " · submitted to HR" : ""}</p>
          </div>
          <button class="btn sm" onclick={() => editEntry(null, selected)}>+ Add</button>
        </header>
        {#if dayEntries.length}
          <DayTimeline entries={dayEntries} date={selected} />
        {/if}
        <div class="detail-list"><EntryList entries={dayEntries} empty="Nothing tracked. Double-click a day to add an entry." /></div>
      {/if}
    </aside>
  </div>
</div>

<WeekDialog bind:open={weekDialog} week={editingWeek} defaultHours={balance?.settings.weekly_hours ?? 0} />

<style>
  .quota-bar {
    display: flex;
    gap: 12px 32px;
    align-items: center;
    flex-wrap: wrap;
    padding: 12px 20px;
  }
  .quota-bar > div {
    display: flex;
    gap: 6px;
    align-items: baseline;
  }
  .quota-bar .btn {
    margin-left: auto;
  }
  .quota-bar strong {
    white-space: nowrap;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 20px;
    align-items: start;
  }
  .cal {
    padding: 12px;
  }
  .grid {
    display: grid;
    gap: 4px;
  }
  .grid:focus {
    outline: none;
  }
  .head,
  .week {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr)) minmax(72px, 0.9fr);
    gap: 4px;
  }
  .head span {
    text-align: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
    padding: 4px 0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .day,
  .week-cell {
    position: relative;
    display: grid;
    align-content: space-between;
    min-height: 74px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid transparent;
    font: inherit;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
    transition: transform 0.1s, border-color 0.15s;
  }
  .day:hover {
    border-color: var(--axis);
  }
  .day.other {
    opacity: 0.45;
  }
  .day.today .num-day {
    background: var(--accent);
    color: #fff;
    border-radius: 999px;
    padding: 0 6px;
    margin-left: -3px;
  }
  .day.selected {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .num-day {
    font-size: 0.82rem;
    font-weight: 600;
    justify-self: start;
  }
  .hours {
    font-weight: 650;
    font-size: 0.95rem;
  }
  .sub-mark {
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 0.75rem;
    color: var(--good-ink);
    font-weight: 700;
  }
  /* intensity: accent mixed into the surface so ink stays readable in both schemes */
  .lvl-0 { background: var(--surface-2); }
  .lvl-1 { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); }
  .lvl-2 { background: color-mix(in srgb, var(--accent) 28%, var(--surface)); }
  .lvl-3 { background: color-mix(in srgb, var(--accent) 42%, var(--surface)); }
  .lvl-4 { background: color-mix(in srgb, var(--accent) 56%, var(--surface)); }
  .lvl-5 { background: color-mix(in srgb, var(--accent) 70%, var(--surface)); }

  .week-cell {
    background: var(--surface);
    border-color: var(--grid);
    text-align: right;
  }
  .week-cell:hover {
    border-color: var(--accent);
  }
  .week-cell .worked {
    font-weight: 700;
  }
  .week-cell .quota {
    font-size: 0.75rem;
    color: var(--muted);
    display: inline-flex;
    gap: 4px;
    justify-content: flex-end;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .st-good {
    background: var(--good-wash);
  }
  .st-good .st-icon {
    color: var(--good-ink);
    font-weight: 800;
  }
  .st-bad {
    background: var(--bad-wash);
  }
  .st-bad .st-icon {
    color: var(--bad-ink);
    font-weight: 800;
  }
  .st-off {
    background: var(--surface-2);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: center;
    padding: 12px 4px 2px;
  }
  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 4px;
  }
  .sep {
    width: 1px;
    height: 14px;
    background: var(--grid);
    margin: 0 4px;
  }

  .detail {
    position: sticky;
    top: 76px;
    display: grid;
    gap: 14px;
    padding: 18px 0 6px;
  }
  .detail > header {
    padding: 0 18px;
    margin: 0;
    align-items: flex-start;
  }
  .detail > :global(.timeline) {
    padding: 0 18px;
  }
  .detail header p {
    color: var(--ink-2);
    margin-top: 2px;
  }
  .detail-list {
    border-top: 1px solid var(--grid);
  }

  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .detail {
      position: static;
    }
  }
  @media (max-width: 560px) {
    .cal {
      padding: 6px;
    }
    .head,
    .week {
      gap: 2px;
      grid-template-columns: repeat(7, minmax(0, 1fr)) 52px;
    }
    .day,
    .week-cell {
      min-height: 54px;
      padding: 4px;
    }
    .hours,
    .week-cell .worked {
      font-size: 0.72rem;
    }
    .week-cell .quota {
      display: none;
    }
  }
</style>
