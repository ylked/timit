<script lang="ts">
  import { ROUTES, route, navigate } from "./lib/router.svelte";
  import { timer, timerElapsed, toggleTimer, refreshTimer, editEntry, notes } from "./lib/state.svelte";
  import { fmtClock } from "./lib/time";
  import Toasts from "./lib/components/Toasts.svelte";
  import Tooltip from "./lib/components/Tooltip.svelte";
  import EntryDialog from "./lib/components/EntryDialog.svelte";
  import Dialog from "./lib/components/Dialog.svelte";
  import Today from "./lib/views/Today.svelte";
  import Entries from "./lib/views/Entries.svelte";
  import Calendar from "./lib/views/Calendar.svelte";
  import Insights from "./lib/views/Insights.svelte";
  import Reports from "./lib/views/Reports.svelte";
  import Settings from "./lib/views/Settings.svelte";

  const views = { today: Today, entries: Entries, calendar: Calendar, insights: Insights, reports: Reports, settings: Settings };
  const View = $derived(views[route.id]);

  let shortcutsOpen = $state(false);

  refreshTimer();
  notes.load();

  function onKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable], dialog[open]")) return;
    if (document.querySelector("dialog[open]")) return;

    const nav = ROUTES.find((r) => r.key === e.key);
    if (nav) {
      navigate(nav.id);
    } else if (e.key === "s" || e.key === " ") {
      if (e.key === " " && target.closest("button, a")) return;
      toggleTimer();
    } else if (e.key === "n") {
      editEntry(null);
    } else if (e.key === "?") {
      shortcutsOpen = true;
    } else {
      return;
    }
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<header class="topbar">
  <div class="inner">
    <a class="brand" href="#/today" aria-label="Timit home">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <circle cx="16" cy="17" r="12" fill="var(--accent)" />
        <rect x="13" y="1" width="6" height="4" rx="1.5" fill="var(--accent)" />
        <path d="M16 9v8l5 3" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" />
      </svg>
      <span>Timit</span>
    </a>

    <nav aria-label="Main">
      {#each ROUTES as r}
        <a href="#/{r.id}" aria-current={route.id === r.id ? "page" : undefined} title="{r.label} ({r.key})">{r.label}</a>
      {/each}
    </nav>

    {#if timer.loaded}
      <button
        class="pill"
        class:running={!!timer.entry}
        onclick={toggleTimer}
        disabled={timer.busy}
        aria-label={timer.entry ? `Stop timer, running ${fmtClock(timerElapsed())}` : "Start timer"}
        title={timer.entry ? "Stop (S)" : "Start (S)"}
      >
        <span class="icon" aria-hidden="true">{#if timer.entry}■{:else}▶{/if}</span>
        <span class="num">{timer.entry ? fmtClock(timerElapsed()) : "Start"}</span>
      </button>
    {/if}
  </div>
</header>

<main>
  <View />
</main>

<datalist id="note-suggestions">
  {#each notes.list as n}<option value={n}></option>{/each}
</datalist>

<EntryDialog />
<Toasts />
<Tooltip />

<Dialog bind:open={shortcutsOpen} title="Keyboard shortcuts">
  <dl class="keys">
    <dt><kbd>S</kbd> or <kbd>Space</kbd></dt><dd>Start / stop the timer</dd>
    <dt><kbd>N</kbd></dt><dd>Add an entry manually</dd>
    {#each ROUTES as r}<dt><kbd>{r.key}</kbd></dt><dd>Go to {r.label}</dd>{/each}
    <dt><kbd>?</kbd></dt><dd>Show this help</dd>
  </dl>
  <div class="dialog-actions">
    <!-- svelte-ignore a11y_autofocus -->
    <button class="btn primary" onclick={() => (shortcutsOpen = false)} autofocus>Got it</button></div>
</Dialog>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: color-mix(in srgb, var(--surface) 82%, transparent);
    backdrop-filter: saturate(1.4) blur(12px);
    border-bottom: 1px solid var(--border);
    view-transition-name: topbar;
  }
  .inner {
    max-width: 1120px;
    margin: 0 auto;
    padding: 10px 24px;
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--ink);
    text-decoration: none;
  }
  nav {
    display: flex;
    gap: 2px;
    flex: 1;
    overflow-x: auto;
    scrollbar-width: none;
  }
  nav a {
    padding: 7px 12px;
    border-radius: 8px;
    color: var(--ink-2);
    text-decoration: none;
    font-weight: 550;
    font-size: 0.92rem;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
  }
  nav a:hover {
    background: var(--surface-hover);
    color: var(--ink);
  }
  nav a[aria-current="page"] {
    background: var(--accent-wash);
    color: var(--accent-ink);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 14px 0 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  .pill:hover {
    background: var(--surface-hover);
  }
  .pill .icon {
    font-size: 0.7rem;
    color: var(--accent);
  }
  .pill.running {
    background: var(--accent);
    border-color: transparent;
    color: #fff;
    min-width: 7.5em;
  }
  .pill.running .icon {
    color: #fff;
  }
  .pill.running:hover {
    background: light-dark(#256abf, #5598e7);
  }

  .keys {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 16px;
    margin: 0;
    font-size: 0.9rem;
  }
  .keys dd {
    margin: 0;
    color: var(--ink-2);
  }
  kbd {
    display: inline-block;
    min-width: 1.6em;
    padding: 1px 6px;
    border-radius: 5px;
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    background: var(--surface-2);
    font: 600 0.8rem var(--font);
    text-align: center;
  }

  /* Mobile: nav becomes a bottom tab bar. */
  @media (max-width: 760px) {
    /* backdrop-filter would make the header the containing block of the fixed nav */
    .topbar {
      backdrop-filter: none;
      background: var(--surface);
    }
    .inner {
      padding: 10px 16px;
      justify-content: space-between;
    }
    nav {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 10;
      padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
      background: color-mix(in srgb, var(--surface) 92%, transparent);
      backdrop-filter: blur(12px);
      border-top: 1px solid var(--border);
      justify-content: space-between;
    }
    nav a {
      flex: 1;
      text-align: center;
      padding: 8px 4px;
      font-size: 0.78rem;
    }
  }
</style>
