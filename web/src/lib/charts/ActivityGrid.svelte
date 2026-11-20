<script lang="ts">
  // Contribution-style grid: one column per week, one square per day.
  import { addDays, fmtDateLong, fmtDuration, isoDate, startOfWeek, HOUR, WEEKDAYS_SHORT } from "../time";
  import { showTip, hideTip } from "../components/Tooltip.svelte";

  let { days }: { days: { date: string; seconds: number }[] } = $props();

  const byDate = $derived(Object.fromEntries(days.map((d) => [d.date, d.seconds])));
  const columns = $derived.by(() => {
    if (!days.length) return [];
    const first = startOfWeek(new Date(`${days[0].date}T00:00:00`));
    const last = days.at(-1)!.date;
    // Show at least 26 weeks so the grid has a stable shape.
    let start = first;
    const minStart = addDays(startOfWeek(new Date(`${last}T00:00:00`)), -25 * 7);
    if (minStart < start) start = minStart;
    const cols: { date: string; seconds: number | null }[][] = [];
    for (let w = start; isoDate(w) <= last; w = addDays(w, 7)) {
      cols.push(
        Array.from({ length: 7 }, (_, i) => {
          const d = isoDate(addDays(w, i));
          return { date: d, seconds: d > last ? null : (byDate[d] ?? 0) };
        }),
      );
    }
    return cols;
  });

  function level(s: number | null) {
    if (s == null) return "none";
    if (s < 60) return "0";
    return String(Math.min(5, Math.ceil(s / (1.5 * HOUR))));
  }
  // Label a column when its week starts a new month, skipping labels that would collide.
  const monthLabels = $derived.by(() => {
    let lastAt = -9;
    return columns.map((col, i) => {
      const d = col[0].date;
      const prev = columns[i - 1]?.[0].date;
      if (prev && prev.slice(5, 7) === d.slice(5, 7)) return "";
      if (i - lastAt < 3) return "";
      lastAt = i;
      return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short" });
    });
  });
</script>

<div class="wrap">
  <div class="grid" style:--cols={columns.length} role="img" aria-label="Daily activity over the last {columns.length} weeks">
    <span></span>
    {#each monthLabels as label}<span class="ml">{label}</span>{/each}
    {#each [0, 1, 2, 3, 4, 5, 6] as wd}
      <span class="dl">{wd % 2 === 0 ? WEEKDAYS_SHORT[wd] : ""}</span>
      {#each columns as col}
        {@const c = col[wd]}
        <span
          role="presentation"
          class="cell l{level(c.seconds)}"
          onpointerenter={(e) => c.seconds != null && showTip(e.currentTarget.getBoundingClientRect(), fmtDateLong(c.date), [c.seconds >= 60 ? fmtDuration(c.seconds) : "Nothing tracked"])}
          onpointerleave={hideTip}
        ></span>
      {/each}
    {/each}
  </div>
</div>

<style>
  .wrap {
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .grid {
    display: grid;
    grid-template-columns: 2.4em repeat(var(--cols), 14px);
    grid-auto-rows: 14px;
    gap: 3px;
    width: max-content;
    grid-auto-flow: row;
  }
  .ml {
    font-size: 10px;
    color: var(--muted);
    white-space: nowrap;
    overflow: visible;
  }
  .dl {
    font-size: 10px;
    color: var(--muted);
    line-height: 14px;
  }
  .cell {
    border-radius: 3px;
  }
  .cell:hover {
    outline: 2px solid var(--ink);
    outline-offset: -1px;
  }
  .lnone { background: transparent; }
  .l0 { background: var(--seq-0); }
  .l1 { background: var(--seq-1); }
  .l2 { background: var(--seq-2); }
  .l3 { background: var(--seq-3); }
  .l4 { background: var(--seq-4); }
  .l5 { background: var(--seq-5); }
</style>
