<script lang="ts">
  import { api, type QuotaSettings } from "../api";
  import { data, invalidate, toast } from "../state.svelte";
  import { theme, setScheme, type Scheme } from "../theme.svelte";
  import { fmtDateLong } from "../time";

  let settings = $state<QuotaSettings | null>(null);
  let hours = $state<number | null>(null);
  let startDate = $state("");
  let error = $state("");
  let saving = $state(false);

  $effect(() => {
    data.version;
    api.quotaSettings().then((s) => {
      settings = s;
      hours = s.weekly_hours;
      startDate = s.start_date_is_default ? "" : s.start_date;
    });
  });

  const dirty = $derived(settings != null && (hours !== settings.weekly_hours || startDate !== (settings.start_date_is_default ? "" : settings.start_date)));

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (hours == null) return;
    saving = true;
    error = "";
    try {
      settings = await api.saveQuotaSettings({ weekly_hours: hours, start_date: startDate || null });
      invalidate();
      toast.show("Quota settings saved");
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }

  const schemes: { id: Scheme; label: string }[] = [
    { id: "system", label: "System" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];
</script>

<div class="page narrow">
  <div class="page-head">
    <div>
      <h1 tabindex="-1">Settings</h1>
      <p class="sub">Quota, appearance and backups</p>
    </div>
  </div>

  <section class="card" aria-labelledby="quota-h">
    <header>
      <h2 id="quota-h">Weekly quota</h2>
      <p>Individual weeks can be changed from the calendar's week column.</p>
    </header>
    <form class="stack" onsubmit={save}>
      <div class="two">
        <label class="field">
          <span>Default hours per week</span>
          <input type="number" min="0" step="0.25" bind:value={hours} required />
        </label>
        <label class="field">
          <span>Count quota from</span>
          <input type="date" bind:value={startDate} />
          <span class="hint">
            {#if settings?.start_date_is_default}Empty: from your first entry ({fmtDateLong(settings.start_date)}){:else}Weeks before this have no quota{/if}
          </span>
        </label>
      </div>
      {#if error}<p class="error-text" role="alert">{error}</p>{/if}
      <div><button class="btn primary" type="submit" disabled={!dirty || saving}>Save quota</button></div>
    </form>
  </section>

  <section class="card" aria-labelledby="look-h">
    <header>
      <h2 id="look-h">Appearance</h2>
      <p>Applies to this browser only.</p>
    </header>
    <div class="segmented" role="radiogroup" aria-label="Color scheme">
      {#each schemes as s}
        <label>
          <input type="radio" name="scheme" value={s.id} checked={theme.scheme === s.id} onchange={() => setScheme(s.id)} />
          {s.label}{#if s.id === "system"}<span class="muted"> (currently {theme.systemDark ? "dark" : "light"})</span>{/if}
        </label>
      {/each}
    </div>
  </section>

  <section class="card" aria-labelledby="backup-h">
    <header>
      <h2 id="backup-h">Backup</h2>
      <p>Everything lives in one SQLite file. Keep a copy somewhere safe.</p>
    </header>
    <div class="row">
      <a class="btn" href={api.backupUrl} download>Download full backup (.db)</a>
      <a class="btn ghost" href={api.exportUrl("json")} download>All entries as JSON</a>
    </div>
  </section>

  <section class="card" aria-labelledby="keys-h">
    <header>
      <h2 id="keys-h">Keyboard shortcuts</h2>
    </header>
    <p class="ink-2">Press <kbd>?</kbd> anywhere to see them. <kbd>S</kbd> starts or stops the timer, <kbd>N</kbd> adds an entry, <kbd>1</kbd>–<kbd>6</kbd> switch pages.</p>
  </section>
</div>

<style>
  .narrow {
    max-width: 760px;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }
  kbd {
    display: inline-block;
    min-width: 1.6em;
    padding: 0 6px;
    border-radius: 5px;
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    background: var(--surface-2);
    font: 600 0.8rem var(--font);
    text-align: center;
  }
</style>
