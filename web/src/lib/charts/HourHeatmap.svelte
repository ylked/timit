<script lang="ts">
  // When do you work? Weekday × hour-of-day, shaded by total time in that slot.
  import { fmtDuration, WEEKDAYS_LONG, WEEKDAYS_SHORT } from "../time";
  import { showTip, hideTip } from "../components/Tooltip.svelte";

  let { heatmap }: { heatmap: number[][] } = $props();

  const active = $derived(heatmap.map((row) => row.findIndex((v) => v > 0)).filter((i) => i >= 0));
  const lo = $derived(Math.max(0, Math.min(7, ...active)));
  const hi = $derived(Math.min(23, Math.max(18, ...heatmap.map((row) => row.findLastIndex((v) => v > 0)))));
  const hours = $derived(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
  const max = $derived(Math.max(1, ...heatmap.flat()));

  function level(v: number) {
    if (v < 60) return 0;
    return Math.min(5, Math.ceil((v / max) * 5));
  }
</script>

<div class="heat" style:--cols={hours.length} role="img" aria-label="Heatmap of tracked time by weekday and hour">
  <span></span>
  {#each hours as h}<span class="hl num">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>{/each}
  {#each heatmap as row, d}
    <span class="dl">{WEEKDAYS_SHORT[d]}</span>
    {#each hours as h}
      <span
        role="presentation"
        class="cell l{level(row[h])}"
        onpointerenter={(e) =>
          showTip(e.currentTarget.getBoundingClientRect(), `${WEEKDAYS_LONG[d]}s, ${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00`, [
            `${fmtDuration(row[h])} in total`,
          ])}
        onpointerleave={hideTip}
      ></span>
    {/each}
  {/each}
</div>
<div class="scale small muted" aria-hidden="true">
  <span>Less</span>
  {#each [0, 1, 2, 3, 4, 5] as l}<span class="cell sw l{l}"></span>{/each}
  <span>More</span>
</div>

<style>
  .heat {
    display: grid;
    grid-template-columns: 2.5em repeat(var(--cols), minmax(0, 1fr));
    gap: 3px;
    align-items: center;
  }
  .hl {
    font-size: 10px;
    color: var(--muted);
    text-align: left;
  }
  .dl {
    font-size: 11px;
    color: var(--muted);
  }
  .cell {
    aspect-ratio: 1;
    border-radius: 3px;
    min-height: 10px;
    max-height: 28px;
  }
  .cell:hover {
    outline: 2px solid var(--ink);
    outline-offset: -1px;
  }
  .l0 { background: var(--seq-0); }
  .l1 { background: var(--seq-1); }
  .l2 { background: var(--seq-2); }
  .l3 { background: var(--seq-3); }
  .l4 { background: var(--seq-4); }
  .l5 { background: var(--seq-5); }
  .scale {
    display: flex;
    gap: 4px;
    align-items: center;
    justify-content: flex-end;
    margin-top: 10px;
  }
  .sw {
    width: 12px;
    height: 12px;
    min-height: 0;
  }
</style>
