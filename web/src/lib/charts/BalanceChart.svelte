<script lang="ts">
  // Running over/under balance after each completed week (zero line = exactly on quota).
  import type { QuotaWeek } from "../api";
  import { fmtDate, fmtSigned, HOUR } from "../time";
  import { showTip, hideTip } from "../components/Tooltip.svelte";

  let { weeks }: { weeks: QuotaWeek[] } = $props();

  const points = $derived(weeks.filter((w) => w.state === "past" && w.quota_hours != null));

  let width = $state(400);
  const height = 200;
  const m = { top: 16, right: 56, bottom: 26, left: 44 };
  const plotW = $derived(Math.max(0, width - m.left - m.right));
  const plotH = height - m.top - m.bottom;

  const values = $derived(points.map((w) => (w.balance_after ?? 0) / HOUR));
  const lo = $derived(Math.min(0, ...values));
  const hi = $derived(Math.max(0, ...values));
  const pad = $derived(Math.max(1, (hi - lo) * 0.1));
  const yMin = $derived(lo - (lo < 0 ? pad : 0));
  const yMax = $derived(hi + (hi > 0 ? pad : 0) || 1);
  const x = (i: number) => m.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => m.top + ((yMax - v) / (yMax - yMin)) * plotH;

  const ticks = $derived.by(() => {
    const span = yMax - yMin;
    const step = [1, 2, 5, 10, 20, 50, 100].find((s) => span / s <= 5) ?? 200;
    const out = [];
    for (let t = Math.ceil(yMin / step) * step; t <= yMax; t += step) out.push(t);
    return out;
  });

  const line = $derived(values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(""));
  const area = $derived(values.length ? `${line}L${x(values.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : "");

  let hover = $state<number | null>(null);
  function move(e: PointerEvent) {
    if (!points.length) return;
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = points.length <= 1 ? 0 : Math.round(((px - m.left) / plotW) * (points.length - 1));
    hover = Math.max(0, Math.min(points.length - 1, i));
    const w = points[hover];
    showTip({ clientX: rect.left + x(hover), clientY: rect.top + y(values[hover]) }, `After week of ${fmtDate(w.week_start, { day: "numeric", month: "short" })}`, [
      `Balance ${fmtSigned(w.balance_after ?? 0)}`,
    ]);
  }
  function leave() {
    hover = null;
    hideTip();
  }
</script>

<div class="chart" bind:clientWidth={width}>
  {#if points.length === 0}
    <p class="empty">No completed weeks with a quota yet.</p>
  {:else}
    <svg {width} {height} role="img" aria-label="Running balance over completed weeks, currently {fmtSigned(points.at(-1)?.balance_after ?? 0)}">
      {#each ticks as t}
        <line x1={m.left} x2={m.left + plotW} y1={y(t)} y2={y(t)} class={t === 0 ? "zero" : "grid"} />
        <text x={m.left - 8} y={y(t)} dy="0.32em" class="ytick">{t > 0 ? "+" : ""}{t}h</text>
      {/each}
      <path d={area} class="area" />
      <path d={line} class="line" />
      {#if hover !== null}
        <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + plotH} class="cross" />
        <circle cx={x(hover)} cy={y(values[hover])} r="5" class="dot" />
      {/if}
      <circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r="4.5" class="dot" />
      <text x={x(values.length - 1) + 10} y={y(values.at(-1)!)} dy="0.32em" class="end">{fmtSigned(points.at(-1)!.balance_after ?? 0).replace(/ /g, "")}</text>
      <text x={m.left} y={height - 6} class="xtick">{fmtDate(points[0].week_start, { day: "numeric", month: "short" })}</text>
      {#if points.length > 1}
        <text x={m.left + plotW} y={height - 6} class="xtick end-x">{fmtDate(points.at(-1)!.week_start, { day: "numeric", month: "short" })}</text>
      {/if}
      <rect x={m.left} y={m.top} width={plotW} height={plotH} fill="transparent" role="presentation" onpointermove={move} onpointerleave={leave} />
    </svg>
  {/if}
</div>

<style>
  svg {
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--grid);
  }
  .zero {
    stroke: var(--axis);
    stroke-width: 1.5;
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
  .end-x {
    text-anchor: end;
  }
  .line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .area {
    fill: var(--accent);
    opacity: 0.1;
  }
  .dot {
    fill: var(--accent);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .cross {
    stroke: var(--axis);
  }
  .end {
    font-size: 12px;
    font-weight: 650;
    fill: var(--ink);
  }
</style>
