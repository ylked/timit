<script lang="ts">
  import { api, type Period, type PeriodState } from "../api";
  import { data, invalidate, toast } from "../state.svelte";
  import { fmtDate, fmtDuration, fmtRange, presetRange } from "../time";
  import PeriodDialog from "../components/PeriodDialog.svelte";

  let ps = $state<PeriodState | null>(null);
  let start = $state("");
  let end = $state("");
  let mark = $state(true);
  let error = $state("");
  let preview = $state<{ seconds: number; days: number } | null>(null);
  let initialised = false;

  let periodDialog = $state(false);
  let editing = $state<Period | null>(null);

  $effect(() => {
    data.version;
    api.periods().then((s) => {
      ps = s;
      if (!initialised) {
        initialised = true;
        if (s.suggested) useSuggested();
        else ({ start, end } = presetRange("last-month"));
      }
    });
  });

  // Live preview of what the export will contain.
  $effect(() => {
    data.version;
    if (!start || !end || end < start) {
      preview = null;
      return;
    }
    api.daySummary(start, end).then((days) => {
      preview = { seconds: days.reduce((s, d) => s + d.seconds, 0), days: days.filter((d) => d.seconds >= 60).length };
    });
  });

  const overlap = $derived(
    ps && start && end ? ps.periods.find((p) => p.start_date <= end && p.end_date >= start && !(p.start_date === start && p.end_date === end)) : undefined,
  );
  const alreadyMarked = $derived(ps?.periods.some((p) => p.start_date === start && p.end_date === end) ?? false);

  function useSuggested() {
    if (!ps?.suggested) return;
    start = ps.suggested.start;
    end = ps.suggested.end;
    mark = true;
  }

  function download(url: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.click();
  }

  async function doExport(kind: "xlsx" | "csv" | "json") {
    error = "";
    if (!start || !end) {
      error = "Pick a start and end date.";
      return;
    }
    if (mark && !alreadyMarked) {
      try {
        await api.createPeriod({ start_date: start, end_date: end });
        invalidate();
        toast.show(`Marked ${fmtRange(start, end)} as submitted to HR`);
      } catch (e) {
        error = `${e instanceof Error ? e.message : e}. Adjust the dates or untick “Mark as submitted”.`;
        return;
      }
    }
    download(api.exportUrl(kind, start, end));
  }

  function openPeriod(p: Period | null) {
    editing = p;
    periodDialog = true;
  }
</script>

<div class="page">
  <div class="page-head">
    <div>
      <h1 tabindex="-1">Reports</h1>
      <p class="sub">Export timesheets and keep track of what you've handed to HR</p>
    </div>
  </div>

  {#if ps}
    {#if ps.unsubmitted.seconds > 0}
      <div class="banner warn" role="status">
        <span class="icon" aria-hidden="true">!</span>
        <div>
          <strong class="num">{fmtDuration(ps.unsubmitted.seconds)}</strong> not yet submitted to HR
          <span class="muted">({fmtRange(ps.unsubmitted.start!, ps.unsubmitted.end!)})</span>
        </div>
        {#if ps.suggested}
          <button class="btn sm" onclick={useSuggested}>Select {fmtRange(ps.suggested.start, ps.suggested.end)}</button>
        {/if}
      </div>
    {:else}
      <div class="banner ok" role="status"><span class="icon" aria-hidden="true">✓</span> All recorded time has been submitted to HR.</div>
    {/if}
  {/if}

  <div class="grid-2">
    <section class="card" aria-labelledby="export-h">
      <header><h2 id="export-h">Export</h2></header>
      <form class="stack" onsubmit={(e) => e.preventDefault()}>
        <div class="row presets">
          {#each [["this-month", "This month"], ["last-month", "Last month"], ["this-week", "This week"], ["last-week", "Last week"]] as [id, label]}
            <button type="button" class="btn sm" onclick={() => ({ start, end } = presetRange(id))}>{label}</button>
          {/each}
        </div>
        <div class="two">
          <label class="field"><span>From</span><input type="date" bind:value={start} required /></label>
          <label class="field"><span>To</span><input type="date" bind:value={end} min={start} required /></label>
        </div>

        <div class="preview">
          {#if preview}
            <span class="big num">{fmtDuration(preview.seconds)}</span>
            <span class="muted">over {preview.days} worked day{preview.days === 1 ? "" : "s"}</span>
          {:else}
            <span class="muted">Pick a valid range</span>
          {/if}
        </div>

        <label class="checkbox">
          <input type="checkbox" bind:checked={mark} />
          <span>
            Mark this range as submitted to HR
            {#if alreadyMarked}<span class="badge good">already submitted</span>{:else if overlap && mark}<span class="badge bad">overlaps {fmtRange(overlap.start_date, overlap.end_date)}</span>{/if}
          </span>
        </label>

        {#if error}<p class="error-text" role="alert">{error}</p>{/if}

        <div class="row">
          <button type="button" class="btn primary" onclick={() => doExport("xlsx")}>Excel report (.xlsx)</button>
          <button type="button" class="btn" onclick={() => doExport("csv")}>CSV</button>
          <button type="button" class="btn" onclick={() => doExport("json")}>JSON</button>
        </div>
        <p class="muted small">The Excel report has a daily summary sheet plus every raw entry.</p>
      </form>
    </section>

    <section class="card flush" aria-labelledby="periods-h">
      <header>
        <h2 id="periods-h">Submitted to HR</h2>
        <button class="btn sm" onclick={() => openPeriod(null)}>+ Add period</button>
      </header>
      {#if ps && ps.periods.length === 0}
        <p class="empty">Nothing submitted yet.</p>
      {:else if ps}
        <ul class="periods" role="list">
          {#each ps.periods as p (p.id)}
            {@const drift = Math.abs(p.current_seconds - p.seconds) >= 60}
            <li>
              <button class="main" onclick={() => openPeriod(p)}>
                <span class="range">{fmtRange(p.start_date, p.end_date)}</span>
                <span class="meta muted small">submitted {fmtDate(p.exported_at, { day: "numeric", month: "short", year: "numeric" })}{p.note ? ` · ${p.note}` : ""}</span>
                <span class="hours num">{fmtDuration(p.seconds)}</span>
                {#if drift}
                  <span class="badge warn" title="Entries in this range changed after it was submitted">⚠ now {fmtDuration(p.current_seconds)}</span>
                {/if}
              </button>
              <button class="btn sm icon ghost" title="Download Excel report" aria-label="Download Excel report for {fmtRange(p.start_date, p.end_date)}" onclick={() => download(api.exportUrl("xlsx", p.start_date, p.end_date))}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>

<PeriodDialog bind:open={periodDialog} period={editing} suggested={ps?.suggested ?? null} />

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: var(--radius);
    flex-wrap: wrap;
  }
  .banner > div {
    flex: 1;
  }
  .banner.warn {
    background: var(--warn-wash);
  }
  .banner.ok {
    background: var(--good-wash);
    color: var(--good-ink);
  }
  .banner .icon {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    font-weight: 800;
    font-size: 0.8rem;
    color: #0b0b0b;
    background: var(--warn);
  }
  .banner.ok .icon {
    background: var(--good);
    color: #fff;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .presets {
    gap: 6px;
  }
  .preview {
    display: flex;
    gap: 10px;
    align-items: baseline;
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .preview .big {
    font-size: 1.4rem;
    font-weight: 650;
  }
  .periods {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .periods li {
    display: flex;
    align-items: center;
    padding-right: 10px;
    border-top: 1px solid var(--grid);
  }
  .periods li:hover {
    background: var(--surface-2);
  }
  .periods .main {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 12px;
    padding: 12px 8px 12px 20px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .range {
    font-weight: 600;
  }
  .hours {
    grid-row: 1;
    grid-column: 2;
    font-weight: 650;
    text-align: right;
  }
  .periods .badge {
    grid-column: 2;
    justify-self: end;
  }
  .card.flush > header {
    padding-bottom: 12px;
    margin-bottom: 0;
  }
</style>
