<script lang="ts">
  // A horizontal 24h strip showing a day's sessions, zoomed to the hours that matter.
  import type { Entry } from "../api";
  import { editEntry, serverNow } from "../state.svelte";
  import { addDays, entrySeconds, fmtDuration, fmtTime, parseLocal, today } from "../time";
  import { showTip, hideTip } from "./Tooltip.svelte";

  let { entries, date }: { entries: Entry[]; date: string } = $props();

  const dayStart = $derived(parseLocal(date));
  const dayEnd = $derived(addDays(date, 1));
  const isToday = $derived(date === today());

  const blocks = $derived(
    entries.map((e) => {
      const s = Math.max(parseLocal(e.start_ts).getTime(), dayStart.getTime());
      const t = Math.min(e.end_ts ? parseLocal(e.end_ts).getTime() : serverNow().getTime(), dayEnd.getTime());
      return { e, from: (s - dayStart.getTime()) / 3.6e6, to: (t - dayStart.getTime()) / 3.6e6 };
    }),
  );

  const nowHour = $derived(isToday ? (serverNow().getTime() - dayStart.getTime()) / 3.6e6 : null);

  // Visible window: at least 08–18, widened to include all sessions (and "now").
  const lo = $derived(Math.max(0, Math.floor(Math.min(8, ...blocks.map((b) => b.from), nowHour ?? 24) - 0.5)));
  const hi = $derived(Math.min(24, Math.ceil(Math.max(18, ...blocks.map((b) => b.to), nowHour ?? 0) + 0.5)));
  const span = $derived(hi - lo);
  const pct = (h: number) => `${((h - lo) / span) * 100}%`;
  const ticks = $derived(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((h) => span <= 12 || h % 2 === 0));
</script>

<div class="timeline" role="group" aria-label="Sessions on the day timeline">
  <div class="track">
    {#each ticks as h}
      <span class="tick" style:left={pct(h)}></span>
    {/each}
    {#each blocks as b (b.e.id)}
      <button
        class="block"
        class:live={!b.e.end_ts}
        style:left={pct(b.from)}
        style:width="max(4px, calc({pct(b.to)} - {pct(b.from)}))"
        aria-label="{fmtTime(b.e.start_ts)} to {b.e.end_ts ? fmtTime(b.e.end_ts) : 'now'}, {fmtDuration(entrySeconds(b.e, serverNow()))}"
        onclick={() => editEntry(b.e)}
        onpointerenter={(ev) =>
          showTip(ev.currentTarget.getBoundingClientRect(), `${fmtTime(b.e.start_ts)} – ${b.e.end_ts ? fmtTime(b.e.end_ts) : "now"}`, [
            fmtDuration(entrySeconds(b.e, serverNow())),
            ...(b.e.note ? [b.e.note] : []),
          ])}
        onpointerleave={hideTip}
      ></button>
    {/each}
    {#if nowHour !== null && nowHour >= lo && nowHour <= hi}
      <span class="now" style:left={pct(nowHour)} title="Now"></span>
    {/if}
  </div>
  <div class="labels num" aria-hidden="true">
    {#each ticks as h}
      <span style:left={pct(h)}>{String(h % 24).padStart(2, "0")}</span>
    {/each}
  </div>
</div>

<style>
  .timeline {
    padding: 4px 0 0;
  }
  .track {
    position: relative;
    height: 36px;
    border-radius: 8px;
    background: var(--surface-2);
  }
  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--grid);
  }
  .block {
    position: absolute;
    top: 5px;
    bottom: 5px;
    border: 0;
    padding: 0;
    border-radius: 4px;
    background: var(--accent);
    cursor: pointer;
    transition: filter 0.15s;
  }
  .block:hover {
    filter: brightness(1.12);
  }
  .block.live {
    background: repeating-linear-gradient(135deg, var(--accent) 0 6px, light-dark(#5598e7, #256abf) 6px 12px);
    background-size: 200% 100%;
  }
  @media (prefers-reduced-motion: no-preference) {
    .block.live {
      animation: slide 2s linear infinite;
    }
  }
  @keyframes slide {
    to {
      background-position: -17px 0;
    }
  }
  .now {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    margin-left: -1px;
    border-radius: 1px;
    background: var(--bad);
  }
  .labels {
    position: relative;
    height: 18px;
    margin-top: 4px;
    font-size: 0.72rem;
    color: var(--muted);
  }
  .labels span {
    position: absolute;
    translate: -50% 0;
  }
</style>
