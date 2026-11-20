<script lang="ts">
  import { untrack } from "svelte";
  import Dialog from "./Dialog.svelte";
  import { api, type Period } from "../api";
  import { invalidate, toast } from "../state.svelte";
  import { fmtDuration } from "../time";

  let {
    open = $bindable(false),
    period,
    suggested,
  }: { open: boolean; period: Period | null; suggested: { start: string; end: string } | null } = $props();

  let start = $state("");
  let end = $state("");
  let exported = $state("");
  let note = $state("");
  let resync = $state(false);
  let error = $state("");

  const drift = $derived(period ? Math.abs(period.current_seconds - period.seconds) >= 60 : false);

  $effect(() => {
    if (open) untrack(init);
  });

  function init() {
    error = "";
    resync = false;
    start = period?.start_date ?? suggested?.start ?? "";
    end = period?.end_date ?? suggested?.end ?? "";
    exported = period ? period.exported_at.slice(0, 16) : "";
    note = period?.note ?? "";
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    const payload = { start_date: start, end_date: end, exported_at: exported || undefined, note: note.trim(), resync };
    try {
      if (period) await api.updatePeriod(period.id, payload);
      else await api.createPeriod(payload);
      open = false;
      invalidate();
      toast.show(period ? "Period updated" : "Period added");
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function remove() {
    if (!period) return;
    const p = period;
    await api.deletePeriod(p.id);
    open = false;
    invalidate();
    toast.show("Period deleted — its hours count as unsubmitted again", {
      action: {
        label: "Undo",
        run: async () => {
          await api.createPeriod({ start_date: p.start_date, end_date: p.end_date, exported_at: p.exported_at, note: p.note });
          invalidate();
        },
      },
    });
  }
</script>

<Dialog bind:open title={period ? "Edit submitted period" : "Add submitted period"} description="A date range you've already handed to HR.">
  <form class="stack" onsubmit={save}>
    <div class="two">
      <label class="field"><span>From</span><input type="date" bind:value={start} required /></label>
      <label class="field"><span>To</span><input type="date" bind:value={end} min={start} required /></label>
    </div>
    <label class="field">
      <span>Submitted on <span class="muted">(defaults to now)</span></span>
      <input type="datetime-local" bind:value={exported} />
    </label>
    <label class="field"><span>Note <span class="muted">(optional)</span></span><input type="text" bind:value={note} /></label>
    {#if period && drift}
      <label class="checkbox">
        <input type="checkbox" bind:checked={resync} />
        <span>Entries changed since submitting. Update the recorded total from <strong class="num">{fmtDuration(period.seconds)}</strong> to
          <strong class="num">{fmtDuration(period.current_seconds)}</strong></span>
      </label>
    {/if}
    {#if error}<p class="error-text" role="alert">{error}</p>{/if}
    <div class="dialog-actions">
      {#if period}<button type="button" class="btn danger left" onclick={remove}>Delete</button>{/if}
      <button type="button" class="btn" onclick={() => (open = false)}>Cancel</button>
      <button type="submit" class="btn primary">Save</button>
    </div>
  </form>
</Dialog>

<style>
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
</style>
