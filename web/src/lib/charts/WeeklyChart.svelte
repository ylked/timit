<script lang="ts">
  // Hours per week as columns, with each week's quota as a tick across the column.
  import type { QuotaWeek } from "../api";
  import { addDays, fmtDate, fmtDuration, fmtHours, fmtSigned, isoDate, HOUR } from "../time";
  import { showTip, hideTip } from "../components/Tooltip.svelte";

  let { weeks }: { weeks: QuotaWeek[] } = $props();

  let width = $state(600);
  const height = 240;
  const m = { top: 16, right: 8, bottom: 28, left: 36 };

  const plotW = $derived(Math.max(0, width - m.left - m.right));
  const plotH = height - m.top - m.bottom;
  const maxH = $derived(Math.max(4, ...weeks.map((w) => Math.max(w.seconds / HOUR, w.quota_hours ?? 0))) * 1.08);
  const step = $derived(niceStep(maxH));
  const ticks = $derived(Array.from({ length: Math.floor(maxH / step) + 1 }, (_, i) => i * step));
  const band = $derived(plotW / Math.max(1, weeks.length));
  const barW = $derived(Math.min(24, band * 0.62));
  const y = (h: number) => m.top + plotH - (h / maxH) * plotH;
  const labelEvery = $derived(Math.ceil(46 / band));

  function niceStep(max: number) {
    const raw = max / 4;
    return [1, 2, 5, 10, 20, 25, 50].find((s) => s >= raw) ?? 100;
  }

  /** Column path with 4px rounded top, square at the baseline. */
  function col(x: number, top: number, w: number) {
    const base = m.top + plotH;
    const r = Math.min(4, w / 2, base - top);
    if (base - top < 0.5) return "";
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
  }

  function tip(e: PointerEvent, w: QuotaWeek) {
    const lines = [`Worked ${fmtDuration(w.seconds)}`];
    if (w.quota_hours != null) {
      lines.push(`Quota ${fmtHours(w.quota_hours)}${w.note ? ` · ${w.note}` : ""}`);
      if (w.state !== "future" && w.quota_hours > 0) {
        const diff = w.seconds - w.quota_hours * HOUR;
        lines.push(`${diff >= -60 ? "✓ met" : w.state === "current" ? "… in progress" : "↓ under"} (${fmtSigned(diff)})`);
      }
    }
    showTip(e, `Week of ${fmtDate(w.week_start, { day: "numeric", month: "short" })}`, lines);
  }
</script>

<div class="chart" bind:clientWidth={width}>
  <svg {width} {height} role="img" aria-label="Hours worked per week compared with the weekly quota">
    {#each ticks as t}
      <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} class={t === 0 ? "axis" : "grid"} />
      <text x={m.left - 8} y={y(t)} class="ytick" dy="0.32em">{t}h</text>
    {/each}

    {#each weeks as w, i (w.week_start)}
      {@const x = m.left + i * band + (band - barW) / 2}
      {@const h = w.seconds / HOUR}
      <g class="wk" class:current={w.state === "current"}>
        <path d={col(x, y(h), barW)} class="bar" class:under={w.state === "past" && w.quota_hours != null && w.quota_hours > 0 && w.seconds < w.quota_hours * HOUR - 60} />
        {#if w.quota_hours != null}
          <line x1={x - 4} x2={x + barW + 4} y1={y(w.quota_hours)} y2={y(w.quota_hours)} class="quota" />
        {/if}
        <rect x={m.left + i * band} y={m.top} width={band} height={plotH} class="hit" role="presentation" onpointermove={(e) => tip(e, w)} onpointerleave={hideTip} />
        {#if i % labelEvery === 0}
          <text x={x + barW / 2} y={height - 8} class="xtick">{fmtDate(w.week_start, { day: "numeric", month: "short" })}</text>
        {/if}
      </g>
    {/each}
  </svg>
  <div class="legend small">
    <span><i class="sw met"></i>Met or over</span>
    <span><i class="sw under"></i>Under quota</span>
    <span><i class="sw q"></i>Quota</span>
  </div>
</div>

<details class="table">
  <summary>Show as table</summary>
  <table>
    <thead><tr><th>Week of</th><th>Worked</th><th>Quota</th><th>Difference</th><th>Balance after</th></tr></thead>
    <tbody>
      {#each weeks.toReversed() as w}
        <tr>
          <td>{fmtDate(w.week_start, { day: "numeric", month: "short", year: "numeric" })} – {fmtDate(isoDate(addDays(w.week_start, 6)), { day: "numeric", month: "short" })}</td>
          <td class="num">{fmtDuration(w.seconds)}</td>
          <td class="num">{w.quota_hours != null ? fmtHours(w.quota_hours) : "—"}{w.note ? ` (${w.note})` : ""}</td>
          <td class="num">{w.quota_hours != null && w.state !== "future" ? fmtSigned(w.seconds - w.quota_hours * HOUR) : "—"}</td>
          <td class="num">{w.balance_after != null ? fmtSigned(w.balance_after) : "—"}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</details>

<style>
  .chart {
    width: 100%;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--grid);
  }
  .axis {
    stroke: var(--axis);
  }
  .ytick,
  .xtick {
    font-size: 11px;
    fill: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .ytick {
    text-anchor: end;
  }
  .xtick {
    text-anchor: middle;
  }
  .bar {
    fill: var(--accent);
    transition: opacity 0.15s;
  }
  .bar.under {
    fill: var(--seq-2);
  }
  .current .bar {
    fill: var(--accent);
    opacity: 0.55;
  }
  .quota {
    stroke: var(--ink);
    stroke-width: 2;
    stroke-linecap: round;
  }
  .hit {
    fill: transparent;
  }
  .wk:hover .bar {
    opacity: 0.8;
  }
  .legend {
    display: flex;
    gap: 16px;
    color: var(--ink-2);
    padding-top: 6px;
    flex-wrap: wrap;
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .sw.met {
    background: var(--accent);
  }
  .sw.under {
    background: var(--seq-2);
  }
  .sw.q {
    height: 2px;
    width: 14px;
    background: var(--ink);
    border-radius: 1px;
  }
  .table {
    margin-top: 10px;
    font-size: 0.85rem;
  }
  .table summary {
    cursor: pointer;
    color: var(--accent-ink);
    font-weight: 550;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
  }
  th,
  td {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--grid);
  }
  th {
    color: var(--muted);
    font-weight: 600;
  }
</style>
