<script lang="ts">
  import { api, type Balance, type Entry, type PeriodState } from "../api";
  import { data, timer, timerElapsed, toggleTimer, startTimer, serverNow, editEntry, clock } from "../state.svelte";
  import { navigate } from "../router.svelte";
  import { addDays, entrySeconds, fmtClock, fmtDuration, fmtShort, fmtSigned, fmtDateLong, isoDate, startOfWeek, today, WEEKDAYS_SHORT, HOUR, fmtTime } from "../time";
  import StatTile from "../components/StatTile.svelte";
  import DayTimeline from "../components/DayTimeline.svelte";
  import EntryList from "../components/EntryList.svelte";
  import { showTip, hideTip } from "../components/Tooltip.svelte";

  let weekEntries = $state<Entry[]>([]);
  let balance = $state<Balance | null>(null);
  let periods = $state<PeriodState | null>(null);
  let loaded = $state(false);

  const todayStr = $derived(isoDate(clock.now));
  const weekStart = $derived(startOfWeek(clock.now));
  const weekDays = $derived(Array.from({ length: 7 }, (_, i) => isoDate(addDays(weekStart, i))));

  $effect(() => {
    data.version;
    const [start, end] = [weekDays[0], weekDays[6]];
    Promise.all([api.entries(start, end), api.balance(), api.periods()]).then(([e, b, p]) => {
      weekEntries = e;
      balance = b;
      periods = p;
      loaded = true;
    });
  });

  // Live per-day totals: clip every entry to each day so running timers tick.
  const perDay = $derived(
    weekDays.map((d) => {
      const from = new Date(`${d}T00:00:00`);
      const to = addDays(d, 1);
      return { date: d, seconds: weekEntries.reduce((s, e) => s + entrySeconds(e, serverNow(), from, to), 0) };
    }),
  );
  const todaySeconds = $derived(perDay.find((d) => d.date === todayStr)?.seconds ?? 0);
  const weekSeconds = $derived(perDay.reduce((s, d) => s + d.seconds, 0));
  const quotaHours = $derived(balance?.current_week.quota_hours ?? null);
  const quotaSeconds = $derived(quotaHours != null ? quotaHours * HOUR : null);
  const progress = $derived(quotaSeconds ? Math.min(1, weekSeconds / quotaSeconds) : 0);
  const left = $derived(quotaSeconds != null ? quotaSeconds - weekSeconds : null);

  const todayEntries = $derived(
    weekEntries
      .filter((e) => e.start_ts.slice(0, 10) === todayStr || (e.end_ts ?? "9999") > `${todayStr}T00:00:00` && e.start_ts < `${todayStr}T00:00:00`)
      .toSorted((a, b) => b.start_ts.localeCompare(a.start_ts)),
  );

  // Finish-line estimate: at today's typical pace, when is the quota met?
  const finishAt = $derived.by(() => {
    if (!timer.entry || left == null || left <= 0) return null;
    return new Date(serverNow().getTime() + left * 1000);
  });

  const greeting = $derived.by(() => {
    const h = clock.now.getHours();
    return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  });

  const barMax = $derived(Math.max(quotaSeconds ? quotaSeconds / 5 : 0, ...perDay.map((d) => d.seconds), HOUR));

  // Ring geometry
  const R = 52;
  const C = 2 * Math.PI * R;

  function onNoteKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      toggleTimer();
    }
  }
</script>

<div class="page">
  <div class="page-head">
    <div>
      <h1 tabindex="-1">{greeting}</h1>
      <p class="sub">{fmtDateLong(todayStr)}</p>
    </div>
    <button class="btn" onclick={() => editEntry(null, todayStr)}>+ Add entry</button>
  </div>

  <section class="hero card" class:running={!!timer.entry} aria-label="Timer">
    <div class="clock-side">
      <div class="clock num" aria-live="off">{fmtClock(timerElapsed())}</div>
      {#if timer.entry}
        <p class="status">
          <span class="dot" aria-hidden="true"></span>
          Running since <strong>{fmtTime(timer.entry.start_ts)}</strong>{#if timer.entry.note}&nbsp;· {timer.entry.note}{/if}
        </p>
        <div class="row">
          <button class="btn primary big stop" onclick={toggleTimer} disabled={timer.busy}>■ Stop</button>
          <button class="btn" onclick={() => timer.entry && editEntry(timer.entry)}>Edit</button>
        </div>
      {:else}
        <div class="start-row">
          <label class="visually-hidden" for="timer-note">What are you working on?</label>
          <input
            id="timer-note"
            type="text"
            placeholder="What are you working on? (optional)"
            list="note-suggestions"
            autocomplete="off"
            bind:value={timer.draft}
            onkeydown={onNoteKey}
          />
          <button class="btn primary big" onclick={toggleTimer} disabled={timer.busy}>▶ Start</button>
        </div>
        <div class="row backdate">
          <span class="muted small">Forgot to start?</span>
          {#each [5, 15, 30, 60] as m}
            <button
              class="btn sm"
              onclick={() => {
                const n = timer.draft;
                timer.draft = "";
                startTimer(n, m);
              }}>{m < 60 ? `${m} min` : "1 h"} ago</button
            >
          {/each}
        </div>
      {/if}
    </div>

    <div class="ring-side">
      <svg viewBox="0 0 128 128" class="ring" role="img" aria-label="This week {fmtDuration(weekSeconds)}{quotaHours != null ? ` of ${quotaHours} hours` : ''}">
        <circle cx="64" cy="64" r={R} class="track" />
        {#if quotaSeconds}
          <circle
            cx="64"
            cy="64"
            r={R}
            class="fill"
            class:done={progress >= 1}
            stroke-dasharray={C}
            stroke-dashoffset={C * (1 - progress)}
            transform="rotate(-90 64 64)"
          />
        {/if}
        <text x="64" y="60" class="ring-value">{fmtShort(weekSeconds)}</text>
        <text x="64" y="80" class="ring-label">{quotaHours != null ? `of ${quotaHours}h` : "this week"}</text>
      </svg>
      <div class="ring-text">
        <h2>This week</h2>
        {#if left == null}
          <p class="muted small">No quota set</p>
        {:else if left > 60}
          <p><strong class="num">{fmtDuration(left)}</strong> to go</p>
          {#if finishAt}
            <p class="muted small">Done at <strong>{finishAt.toTimeString().slice(0, 5)}</strong>{finishAt.getDate() !== clock.now.getDate() ? " (another day)" : ""} if you keep going</p>
          {/if}
        {:else}
          <p class="good"><strong>Quota met</strong> 🎉</p>
          <p class="muted small">{fmtSigned(-left)} over</p>
        {/if}
      </div>
    </div>
  </section>

  <div class="tiles">
    <StatTile label="Today" value={fmtDuration(todaySeconds)} sub="{todayEntries.length} session{todayEntries.length === 1 ? '' : 's'}" />
    <StatTile label="This week" value={fmtDuration(weekSeconds)} sub={quotaHours != null ? `${Math.round(progress * 100)}% of ${quotaHours}h` : "no quota"} />
    <StatTile
      label="Balance"
      value={balance ? fmtSigned(balance.balance_seconds) : "–"}
      tone={balance && Math.abs(balance.balance_seconds) >= 60 ? (balance.balance_seconds > 0 ? "good" : "bad") : undefined}
      sub="over/under, completed weeks"
    />
    <button class="tile-link" onclick={() => navigate("reports")} aria-label="Unsubmitted hours, open reports">
      <StatTile
        label="Not yet submitted to HR"
        value={periods ? fmtDuration(periods.unsubmitted.seconds) : "–"}
        sub={periods?.suggested ? "Open reports →" : "All caught up"}
      />
    </button>
  </div>

  <div class="grid-2">
    <section class="card flush" aria-labelledby="today-h">
      <header>
        <h2 id="today-h">Today's sessions</h2>
        <p class="num">{fmtDuration(todaySeconds)}</p>
      </header>
      <div class="pad"><DayTimeline entries={todayEntries} date={todayStr} /></div>
      {#if loaded}
        <EntryList entries={todayEntries} empty="Nothing tracked yet today. Press S to start." />
      {/if}
    </section>

    <section class="card" aria-labelledby="week-h">
      <header>
        <h2 id="week-h">Day by day</h2>
        <p>{quotaHours != null ? `line: even split of ${quotaHours}h over 5 days` : ""}</p>
      </header>
      <div class="bars" role="list">
        {#each perDay as d, i}
          {@const h = (d.seconds / barMax) * 100}
          <div
            class="bar-col"
            class:today={d.date === todayStr}
            class:future={d.date > todayStr}
            role="listitem"
            aria-label="{WEEKDAYS_SHORT[i]}: {fmtDuration(d.seconds)}"
            onpointerenter={(e) => showTip(e.currentTarget.getBoundingClientRect(), WEEKDAYS_SHORT[i], [fmtDuration(d.seconds)])}
            onpointerleave={hideTip}
          >
            <span class="bar-val num">{d.seconds >= 60 ? fmtShort(d.seconds) : ""}</span>
            <div class="bar-area">
              {#if quotaSeconds}<span class="pace" style:bottom="{(quotaSeconds / 5 / barMax) * 100}%"></span>{/if}
              <div class="bar" style:height="{h}%"></div>
            </div>
            <span class="bar-day">{WEEKDAYS_SHORT[i]}</span>
          </div>
        {/each}
      </div>
    </section>
  </div>
</div>

<style>
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 24px;
    align-items: center;
    padding: 28px;
    transition: border-color 0.3s, background 0.3s;
  }
  .hero.running {
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    background: linear-gradient(135deg, var(--accent-wash), var(--surface) 60%);
  }
  .clock-side {
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  .clock {
    font-size: clamp(3rem, 9vw, 4.75rem);
    font-weight: 300;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .running .clock {
    color: var(--accent-ink);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-2);
  }
  .dot {
    width: 8px;
    height: 8px;
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
      opacity: 0.25;
    }
  }
  .start-row {
    display: flex;
    gap: 8px;
  }
  .start-row input {
    height: 44px;
    font-size: 1rem;
  }
  .big {
    height: 44px;
    padding: 0 22px;
    font-size: 1rem;
  }
  .stop {
    min-width: 120px;
  }
  .backdate {
    gap: 6px;
  }

  .ring-side {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .ring {
    width: 128px;
    height: 128px;
  }
  .ring .track {
    fill: none;
    stroke: var(--surface-2);
    stroke-width: 12;
  }
  .ring .fill {
    fill: none;
    stroke: var(--accent);
    stroke-width: 12;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.6s var(--ease);
  }
  .ring .fill.done {
    stroke: var(--good);
  }
  .ring-value {
    text-anchor: middle;
    font-size: 22px;
    font-weight: 650;
    fill: var(--ink);
  }
  .ring-label {
    text-anchor: middle;
    font-size: 12px;
    fill: var(--muted);
  }
  .ring-text {
    display: grid;
    gap: 2px;
    min-width: 150px;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
    gap: 16px;
  }
  .tile-link {
    all: unset;
    display: grid;
    cursor: pointer;
    border-radius: var(--radius);
  }
  .tile-link:hover :global(.card) {
    border-color: var(--accent);
  }
  .tile-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .pad {
    padding: 0 20px 12px;
  }

  .bars {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    height: 220px;
  }
  .bar-col {
    display: grid;
    grid-template-rows: auto 1fr auto;
    justify-items: center;
    gap: 6px;
    min-width: 0;
  }
  .bar-area {
    position: relative;
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: flex-end;
  }
  .bar {
    position: absolute;
    bottom: 0;
    left: 50%;
    translate: -50% 0;
    width: min(24px, 70%);
    min-height: 2px;
    border-radius: 4px 4px 0 0;
    background: var(--seq-2);
    transition: height 0.5s var(--ease);
  }
  .today .bar {
    background: var(--accent);
  }
  .pace {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid var(--muted);
  }
  .bar-area::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1px;
    background: var(--axis);
  }
  .bar-val {
    font-size: 0.75rem;
    color: var(--ink-2);
    min-height: 1.2em;
  }
  .bar-day {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .today .bar-day {
    color: var(--accent-ink);
    font-weight: 700;
  }
  .future .bar-day {
    opacity: 0.6;
  }

  @media (max-width: 760px) {
    .hero {
      grid-template-columns: 1fr;
      padding: 20px;
    }
    .start-row {
      flex-direction: column;
    }
  }
</style>
