<script lang="ts">
  import { api, type Entry } from "../api";
  import { data, editEntry, serverNow } from "../state.svelte";
  import { PRESETS, presetRange, entrySeconds, fmtDuration, fmtDate, fmtRange, addDays, parseLocal, isoDate } from "../time";
  import EntryList from "../components/EntryList.svelte";

  let preset = $state<string>("this-week");
  let start = $state(presetRange("this-week").start);
  let end = $state(presetRange("this-week").end);
  let query = $state("");
  let entries = $state<Entry[]>([]);
  let loading = $state(true);

  function choose(id: string) {
    preset = id;
    ({ start, end } = presetRange(id));
  }

  function shift(direction: -1 | 1) {
    const days = Math.round((parseLocal(end).getTime() - parseLocal(start).getTime()) / 864e5) + 1;
    start = isoDate(addDays(start, direction * days));
    end = isoDate(addDays(end, direction * days));
    preset = "custom";
  }

  $effect(() => {
    data.version;
    if (!start || !end || end < start) return;
    loading = true;
    api.entries(start, end).then((e) => {
      entries = e;
      loading = false;
    });
  });

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => !q || (e.note ?? "").toLowerCase().includes(q))
      .toSorted((a, b) => b.start_ts.localeCompare(a.start_ts));
  });

  const groups = $derived.by(() => {
    const map = new Map<string, Entry[]>();
    for (const e of filtered) {
      const d = e.start_ts.slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    }
    return [...map].map(([date, items]) => ({ date, items, seconds: items.reduce((s, e) => s + entrySeconds(e, serverNow()), 0) }));
  });

  const total = $derived(groups.reduce((s, g) => s + g.seconds, 0));
  const maxDay = $derived(Math.max(1, ...groups.map((g) => g.seconds)));
</script>

<div class="page">
  <div class="page-head">
    <div>
      <h1 tabindex="-1">Entries</h1>
      <p class="sub">{fmtRange(start, end)}</p>
    </div>
    <button class="btn primary" onclick={() => editEntry(null)}>+ Add entry</button>
  </div>

  <div class="card toolbar">
    <div class="segmented" role="radiogroup" aria-label="Date range">
      {#each PRESETS as p}
        <label><input type="radio" name="range" value={p.id} checked={preset === p.id} onchange={() => choose(p.id)} />{p.label}</label>
      {/each}
    </div>
    <div class="row custom">
      <button class="btn icon sm" aria-label="Previous period" onclick={() => shift(-1)}>‹</button>
      <label class="visually-hidden" for="e-start">From</label>
      <input id="e-start" type="date" bind:value={start} onchange={() => (preset = "custom")} />
      <span class="muted">→</span>
      <label class="visually-hidden" for="e-end">To</label>
      <input id="e-end" type="date" bind:value={end} min={start} onchange={() => (preset = "custom")} />
      <button class="btn icon sm" aria-label="Next period" onclick={() => shift(1)}>›</button>
    </div>
    <input class="search" type="search" placeholder="Filter by note…" bind:value={query} aria-label="Filter entries by note" />
  </div>

  <p class="summary" aria-live="polite">
    <strong class="num">{fmtDuration(total)}</strong>
    <span class="muted">across {filtered.length} entr{filtered.length === 1 ? "y" : "ies"} on {groups.length} day{groups.length === 1 ? "" : "s"}{#if groups.length > 0}{" "}· avg {fmtDuration(total / groups.length)} per worked day{/if}</span>
  </p>

  {#if !loading && groups.length === 0}
    <div class="card"><p class="empty">No entries in this range{query ? " matching your filter" : ""}.</p></div>
  {/if}

  {#each groups as g (g.date)}
    <section class="card flush day">
      <header>
        <h2>{fmtDate(g.date, { weekday: "long", day: "numeric", month: "long" })}</h2>
        <div class="day-total">
          <span class="meter" aria-hidden="true"><span style:width="{(g.seconds / maxDay) * 100}%"></span></span>
          <span class="num">{fmtDuration(g.seconds)}</span>
        </div>
      </header>
      <EntryList entries={g.items} />
    </section>
  {/each}
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    padding: 12px;
  }
  .custom input {
    width: auto;
    height: 32px;
  }
  .search {
    flex: 1;
    min-width: 180px;
    height: 32px !important;
  }
  .summary {
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
    font-size: 1.05rem;
    margin-top: -4px;
  }
  .day > header {
    padding-bottom: 10px;
    border-bottom: 1px solid var(--grid);
    margin-bottom: 0;
  }
  .day-total {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
  }
  .meter {
    width: 80px;
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
  }
</style>
