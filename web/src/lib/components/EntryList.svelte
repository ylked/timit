<script lang="ts">
  import type { Entry } from "../api";
  import { editEntry, deleteEntry, serverNow } from "../state.svelte";
  import { entrySeconds, fmtDuration, fmtTime, fmtDate } from "../time";

  let { entries, showDate = false, empty = "No entries." }: { entries: Entry[]; showDate?: boolean; empty?: string } = $props();
</script>

{#if entries.length === 0}
  <p class="empty">{empty}</p>
{:else}
  <ul class="entries" role="list">
    {#each entries as e (e.id)}
      {@const live = !e.end_ts}
      <li class:live>
        <button class="main" onclick={() => editEntry(e)} aria-label="Edit entry {fmtTime(e.start_ts)} to {live ? 'now' : fmtTime(e.end_ts!)}">
          {#if showDate}<span class="date">{fmtDate(e.start_ts)}</span>{/if}
          <span class="time num">
            {fmtTime(e.start_ts)}<span class="muted">–</span>{#if live}<span class="now"><span class="dot" aria-hidden="true"></span>now</span>{:else}{fmtTime(e.end_ts!)}{#if e.end_ts!.slice(0, 10) !== e.start_ts.slice(0, 10)}<sup class="muted" title="Ends the next day">+1</sup>{/if}{/if}
          </span>
          <span class="note" class:muted={!e.note}>{e.note || "No note"}</span>
          <span class="dur num">{fmtDuration(entrySeconds(e, serverNow()))}</span>
        </button>
        <button class="btn icon sm ghost del" aria-label="Delete entry" title="Delete" onclick={() => deleteEntry(e)}>
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .entries {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 8px;
    border-top: 1px solid var(--grid);
  }
  li:first-child {
    border-top: 0;
  }
  li:hover {
    background: var(--surface-2);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 11px 8px 11px 20px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .main:has(.date) {
    grid-template-columns: 7.5em auto minmax(0, 1fr) auto;
  }
  .date {
    color: var(--ink-2);
    font-size: 0.9rem;
  }
  .time {
    font-weight: 550;
    min-width: 7.5em;
  }
  .note {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink-2);
  }
  .dur {
    font-weight: 600;
  }
  .live .dur {
    color: var(--accent-ink);
  }
  .now {
    margin-left: 4px;
    color: var(--accent-ink);
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }
  @media (prefers-reduced-motion: no-preference) {
    .dot {
      animation: pulse 1.6s ease-in-out infinite;
    }
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  .del {
    color: var(--muted);
    opacity: 0;
    transition: opacity 0.15s;
  }
  li:hover .del,
  .del:focus-visible {
    opacity: 1;
  }
  .del:hover {
    color: var(--bad-ink);
  }
  @media (hover: none) {
    .del {
      opacity: 1;
    }
  }
  @media (max-width: 560px) {
    .main,
    .main:has(.date) {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 2px 12px;
      padding-left: 16px;
    }
    .date {
      grid-column: 1 / -1;
      font-size: 0.8rem;
    }
    .note {
      grid-column: 1;
      grid-row: auto;
      font-size: 0.85rem;
    }
    .dur {
      grid-row: span 2;
    }
    .main:has(.date) .dur {
      grid-row: 2 / span 2;
      grid-column: 2;
    }
  }
</style>
