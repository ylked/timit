<script lang="ts">
  import { untrack } from "svelte";
  import Dialog from "./Dialog.svelte";
  import { api, type QuotaWeek } from "../api";
  import { invalidate, toast } from "../state.svelte";
  import { addDays, fmtDuration, fmtHours, fmtRange, fmtSigned, isoDate } from "../time";

  let { open = $bindable(false), week, defaultHours }: { open: boolean; week: QuotaWeek | null; defaultHours: number } = $props();

  let hours = $state<number | null>(null);
  let note = $state("");
  let error = $state("");

  $effect(() => {
    if (open && week) {
      const w = week;
      untrack(() => {
        hours = w.quota_hours;
        note = w.note;
        error = "";
      });
    }
  });

  const title = $derived(week ? `Week of ${fmtRange(week.week_start, isoDate(addDays(week.week_start, 6)))}` : "");
  const presets = $derived([
    { label: "Off (0h)", value: 0, note: "Vacation" },
    { label: `Half (${fmtHours(defaultHours / 2)})`, value: defaultHours / 2 },
    { label: `Default (${fmtHours(defaultHours)})`, value: defaultHours },
  ]);

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!week || hours == null) return;
    try {
      await api.setWeekQuota(week.week_start, hours, note.trim());
      open = false;
      invalidate();
      toast.show("Week quota saved");
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function reset() {
    if (!week) return;
    await api.resetWeekQuota(week.week_start);
    open = false;
    invalidate();
    toast.show("Week reset to the default quota");
  }
</script>

<Dialog bind:open {title} description="Change this week's target, e.g. 0 for a vacation or sick week.">
  {#if week}
    <form class="stack" onsubmit={save}>
      <p class="worked">
        Worked <strong class="num">{fmtDuration(week.seconds)}</strong>
        {#if week.quota_hours != null && week.state !== "future"}
          <span class="muted">· {fmtSigned(week.seconds - week.quota_hours * 3600)} vs quota</span>
        {/if}
      </p>
      <label class="field">
        <span>Quota (hours)</span>
        <input type="number" min="0" step="0.25" bind:value={hours} required />
      </label>
      <div class="row">
        {#each presets as p}
          <button
            type="button"
            class="btn sm"
            onclick={() => {
              hours = p.value;
              if (p.note && !note) note = p.note;
            }}>{p.label}</button
          >
        {/each}
      </div>
      <label class="field">
        <span>Note <span class="muted">(optional)</span></span>
        <input type="text" bind:value={note} placeholder="e.g. vacation, sick, public holiday" />
      </label>
      {#if error}<p class="error-text" role="alert">{error}</p>{/if}
      <div class="dialog-actions">
        {#if week.is_override}
          <button type="button" class="btn left" onclick={reset}>Use default</button>
        {/if}
        <button type="button" class="btn" onclick={() => (open = false)}>Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  {/if}
</Dialog>

<style>
  .worked {
    color: var(--ink-2);
  }
</style>
