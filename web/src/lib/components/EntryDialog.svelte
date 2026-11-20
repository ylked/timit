<script lang="ts">
  // Add/edit an entry. Uses date + time fields; an end time before the start means "next day".
  import { untrack } from "svelte";
  import Dialog from "./Dialog.svelte";
  import { api } from "../api";
  import { entryEditor, invalidate, deleteEntry, refreshTimer, toast, notes } from "../state.svelte";
  import { addDays, fmtDuration, isoDate, parseLocal, pad, today } from "../time";

  let date = $state("");
  let start = $state("");
  let end = $state("");
  let running = $state(false);
  let note = $state("");
  let error = $state("");
  let saving = $state(false);

  const entry = $derived(entryEditor.entry);

  // Initialise the form whenever the dialog opens.
  $effect(() => {
    if (entryEditor.open) untrack(init);
  });

  function init() {
    error = "";
    const e = entryEditor.entry;
    if (e) {
      date = e.start_ts.slice(0, 10);
      start = e.start_ts.slice(11, 16);
      end = e.end_ts ? e.end_ts.slice(11, 16) : "";
      running = !e.end_ts;
      note = e.note ?? "";
    } else {
      const now = new Date();
      date = entryEditor.date ?? today();
      const isToday = date === today();
      // Sensible defaults: the last hour if adding for today, 09:00–12:00 otherwise.
      start = isToday ? `${pad(Math.max(0, now.getHours() - 1))}:${pad(now.getMinutes())}` : "09:00";
      end = isToday ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : "12:00";
      running = false;
      note = "";
    }
    notes.load();
  }

  const computed = $derived.by(() => {
    if (!date || !start) return null;
    const startTs = `${date}T${start}:00`;
    if (running || !end) return { startTs, endTs: null, seconds: null, overnight: false };
    const overnight = end <= start;
    const endDate = overnight ? isoDate(addDays(date, 1)) : date;
    const endTs = `${endDate}T${end}:00`;
    return { startTs, endTs, seconds: (parseLocal(endTs).getTime() - parseLocal(startTs).getTime()) / 1000, overnight };
  });

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!computed) return;
    if (!running && !end) {
      error = "Enter an end time, or tick “Still running”.";
      return;
    }
    saving = true;
    error = "";
    const payload = { start_ts: computed.startTs, end_ts: computed.endTs, note: note.trim() };
    try {
      if (entry) await api.updateEntry(entry.id, payload);
      else await api.createEntry(payload);
      entryEditor.open = false;
      if (running || entry?.end_ts === null) await refreshTimer();
      invalidate();
      toast.show(entry ? "Entry updated" : "Entry added");
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!entry) return;
    entryEditor.open = false;
    await deleteEntry(entry);
  }
</script>

<Dialog bind:open={entryEditor.open} title={entry ? "Edit entry" : "Add entry"}>
  <form class="stack" onsubmit={save}>
    <label class="field">
      <span>Date</span>
      <input type="date" bind:value={date} required />
    </label>
    <div class="times">
      <label class="field">
        <span>Start</span>
        <input type="time" bind:value={start} required />
      </label>
      <label class="field">
        <span>End</span>
        <input type="time" bind:value={end} disabled={running} required={!running} />
      </label>
    </div>
    <label class="checkbox">
      <input type="checkbox" bind:checked={running} />
      <span>Still running (no end time yet)</span>
    </label>
    <label class="field">
      <span>Note <span class="muted">(optional)</span></span>
      <input type="text" bind:value={note} list="note-suggestions" placeholder="What did you work on?" autocomplete="off" />
    </label>

    <p class="summary" aria-live="polite">
      {#if computed?.seconds != null}
        Duration <strong class="num">{fmtDuration(computed.seconds)}</strong>
        {#if computed.overnight}<span class="badge warn">ends next day</span>{/if}
      {:else if running}
        Counts until you stop the timer.
      {/if}
    </p>

    {#if error}<p class="error-text" role="alert">{error}</p>{/if}

    <div class="dialog-actions">
      {#if entry}
        <button type="button" class="btn danger left" onclick={remove}>Delete</button>
      {/if}
      <button type="button" class="btn" onclick={() => (entryEditor.open = false)}>Cancel</button>
      <button type="submit" class="btn primary" disabled={saving}>{entry ? "Save" : "Add entry"}</button>
    </div>
  </form>
</Dialog>

<style>
  .times {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .summary {
    min-height: 1.5em;
    color: var(--ink-2);
    font-size: 0.9rem;
    display: flex;
    gap: 8px;
    align-items: center;
  }
</style>
