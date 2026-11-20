<script lang="ts">
  import { api, type Insights } from "../api";
  import { data } from "../state.svelte";
  import { fmtDate, fmtDateLong, fmtDuration, fmtMoney, fmtMinutes, fmtShort, fmtSigned, fmtTime, HOUR, WEEKDAYS_LONG, WEEKDAYS_SHORT } from "../time";
  import StatTile from "../components/StatTile.svelte";
  import WeeklyChart from "../charts/WeeklyChart.svelte";
  import BalanceChart from "../charts/BalanceChart.svelte";
  import HourHeatmap from "../charts/HourHeatmap.svelte";
  import ActivityGrid from "../charts/ActivityGrid.svelte";
  import { showTip, hideTip } from "../components/Tooltip.svelte";

  let ins = $state<Insights | null>(null);
  let empty = $state(false);

  $effect(() => {
    data.version;
    api.insights().then((r) => {
      empty = r.empty;
      ins = r.empty ? null : r;
    });
  });

  const balance = $derived(ins?.weeks.filter((w) => w.state === "past").at(-1)?.balance_after ?? 0);
  const weekdayMax = $derived(Math.max(1, ...(ins?.weekdays.map((w) => w.avg_seconds) ?? [])));
  const favourite = $derived(ins ? ins.weekdays.toSorted((a, b) => b.seconds - a.seconds)[0] : null);
  const thisMonth = $derived(ins?.months.at(-1));
  const lastMonth = $derived(ins?.months.at(-2));
  const monthMax = $derived(Math.max(1, ...(ins?.months.map((m) => m.seconds) ?? [])));

  // Recent trend: last 4 completed weeks vs the 4 before that.
  const trend = $derived.by(() => {
    const past = ins?.weeks.filter((w) => w.state === "past") ?? [];
    if (past.length < 2) return null;
    const recent = past.slice(-4);
    const before = past.slice(-8, -4);
    const avg = (xs: typeof past) => xs.reduce((s, w) => s + w.seconds, 0) / xs.length;
    return { recent: avg(recent), before: before.length ? avg(before) : null };
  });

  // Hours that most often have work in them.
  const peakHour = $derived.by(() => {
    if (!ins) return null;
    const byHour = Array.from({ length: 24 }, (_, h) => ins!.heatmap.reduce((s, row) => s + row[h], 0));
    const h = byHour.indexOf(Math.max(...byHour));
    return byHour[h] > 0 ? h : null;
  });

  const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
</script>

<div class="page">
  <div class="page-head">
    <div>
      <h1 tabindex="-1">Insights</h1>
      <p class="sub">{ins ? `Since ${fmtDateLong(ins.first_day)}` : "Patterns in your tracked time"}</p>
    </div>
  </div>

  {#if empty}
    <div class="card"><p class="empty">Track some time first — insights appear as soon as there's data.</p></div>
  {:else if ins}
    <div class="tiles">
      <StatTile label="Total tracked" value={fmtShort(ins.total_seconds)} sub="{ins.days_worked} days worked" />
      {#if ins.earned_total != null}
        <StatTile
          label="Earned (gross)"
          value={fmtMoney(ins.earned_total, ins.currency, { whole: true })}
          sub={ins.avg_week_earned != null ? `≈ ${fmtMoney(ins.avg_week_earned, ins.currency, { whole: true })} per week · ${fmtMoney(ins.rate!, ins.currency)}/h` : `${fmtMoney(ins.rate!, ins.currency)}/h`}
        />
      {/if}
      <StatTile label="Average week" value={fmtDuration(ins.avg_week_seconds)} sub="completed weeks">
        {#if trend?.before != null}
          {@const d = trend.recent - trend.before}
          <span class="delta" class:good={d > 0} class:bad={d < 0}>{d >= 0 ? "▲" : "▼"} {fmtDuration(Math.abs(d))} <span class="muted">last 4 wks vs previous 4</span></span>
        {/if}
      </StatTile>
      <StatTile label="Average workday" value={fmtDuration(ins.avg_day_seconds)} sub="typically {fmtMinutes(ins.typical_start_minutes)}–{fmtMinutes(ins.typical_end_minutes)}" />
      <StatTile
        label="Balance"
        value={fmtSigned(balance)}
        tone={Math.abs(balance) < 60 ? undefined : balance > 0 ? "good" : "bad"}
        sub="quota streak {ins.quota_streak.current} wk · best {ins.quota_streak.best}"
      >
        {#if ins.rate != null && Math.abs(balance) >= 60}
          <span class="delta muted">≈ {balance > 0 ? "+" : "−"}{fmtMoney(Math.abs(balance / HOUR) * ins.rate, ins.currency, { whole: true })} vs quota at the current rate</span>
        {/if}
      </StatTile>
    </div>

    <section class="card">
      <header>
        <h2>Weekly hours vs quota</h2>
        <p>Hover a week for details · the current week is lighter</p>
      </header>
      <WeeklyChart weeks={ins.weeks} currency={ins.currency} />
    </section>

    <div class="grid-2">
      <section class="card">
        <header>
          <h2>Running balance</h2>
          <p>Over/under quota after each completed week</p>
        </header>
        <BalanceChart weeks={ins.weeks} />
      </section>

      <section class="card">
        <header>
          <h2>Your weekdays</h2>
          <p>Average per worked day</p>
        </header>
        <ul class="hbars" role="list">
          {#each ins.weekdays as w}
            <li
              onpointerenter={(e) =>
                showTip(e.currentTarget.getBoundingClientRect(), WEEKDAYS_LONG[w.weekday], [
                  `${w.days_worked} day${w.days_worked === 1 ? "" : "s"} worked`,
                  `${fmtDuration(w.seconds)} in total`,
                ])}
              onpointerleave={hideTip}
            >
              <span class="lbl">{WEEKDAYS_SHORT[w.weekday]}</span>
              <span class="track"><span class="fill" class:top={w === favourite} style:width="{(w.avg_seconds / weekdayMax) * 100}%"></span></span>
              <span class="val num">{w.days_worked ? fmtDuration(w.avg_seconds) : "—"}</span>
              <span class="cnt muted small num">{w.days_worked}×</span>
            </li>
          {/each}
        </ul>
      </section>
    </div>

    <div class="grid-2">
      <section class="card">
        <header>
          <h2>When you work</h2>
          <p>{peakHour != null ? `Busiest hour: ${String(peakHour).padStart(2, "0")}:00` : ""}</p>
        </header>
        <HourHeatmap heatmap={ins.heatmap} />
      </section>

      <section class="card">
        <header>
          <h2>Records & fun facts</h2>
        </header>
        <dl class="facts">
          {#if ins.sessions.longest}
            <div>
              <dt>Longest session</dt>
              <dd><strong class="num">{fmtDuration(ins.sessions.longest.seconds)}</strong> on {fmtDate(ins.sessions.longest.start)} ({fmtTime(ins.sessions.longest.start)}–{fmtTime(ins.sessions.longest.end)})</dd>
            </div>
          {/if}
          <div><dt>Biggest day</dt><dd><strong class="num">{fmtDuration(ins.best_day.seconds)}</strong> on {fmtDate(ins.best_day.date)}</dd></div>
          <div><dt>Biggest week</dt><dd><strong class="num">{fmtDuration(ins.best_week.seconds)}</strong>, week of {fmtDate(ins.best_week.week_start, { day: "numeric", month: "short" })}</dd></div>
          <div><dt>Earliest start</dt><dd><strong class="num">{fmtMinutes(ins.earliest_start.minutes)}</strong> on {fmtDate(ins.earliest_start.date)}</dd></div>
          <div><dt>Latest finish</dt><dd><strong class="num">{fmtMinutes(ins.latest_end.minutes)}</strong> on {fmtDate(ins.latest_end.date)}</dd></div>
          <div>
            <dt>Sessions</dt>
            <dd><strong class="num">{ins.sessions.count}</strong>, typically {fmtDuration(ins.sessions.median_seconds)} long</dd>
          </div>
          {#if favourite && favourite.seconds > 0}
            <div><dt>Favourite day</dt><dd><strong>{WEEKDAYS_LONG[favourite.weekday]}</strong> — {Math.round((favourite.seconds / ins.total_seconds) * 100)}% of all your time</dd></div>
          {/if}
          {#if thisMonth}
            <div>
              <dt>This month</dt>
              <dd>
                <strong class="num">{fmtDuration(thisMonth.seconds)}</strong>{#if thisMonth.earned != null}<span class="muted">&nbsp;· {fmtMoney(thisMonth.earned, ins.currency, { whole: true })}</span>{/if}{#if lastMonth}<span class="muted">&nbsp;· {monthName(lastMonth.month).split(" ")[0]}: {fmtDuration(lastMonth.seconds)}</span>{/if}
              </dd>
            </div>
          {/if}
        </dl>
      </section>
    </div>

    <section class="card">
      <header>
        <h2>Activity</h2>
        <p>Each square is a day</p>
      </header>
      <ActivityGrid days={ins.days} />
    </section>

    <section class="card">
      <header><h2>By month</h2></header>
      <ul class="hbars months" role="list">
        {#each ins.months.toReversed() as m}
          <li>
            <span class="lbl">{monthName(m.month)}</span>
            <span class="track"><span class="fill" style:width="{(m.seconds / monthMax) * 100}%"></span></span>
            <span class="val num">{fmtDuration(m.seconds)}</span>
            <span class="cnt muted small num">{m.earned != null ? fmtMoney(m.earned, ins.currency, { whole: true }) : `${(m.seconds / HOUR).toFixed(1)}h`}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
    gap: 16px;
  }
  .delta {
    font-size: 0.8rem;
    font-weight: 600;
    margin-top: 4px;
  }
  .hbars {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 10px;
  }
  .hbars li {
    display: grid;
    grid-template-columns: 2.6em 1fr 5.2em 2.4em;
    gap: 10px;
    align-items: center;
  }
  .months li {
    grid-template-columns: 9em 1fr 5.5em 7em;
  }
  .lbl {
    font-size: 0.85rem;
    color: var(--ink-2);
  }
  .track {
    height: 14px;
    border-radius: 0 4px 4px 0;
    background: transparent;
    border-left: 1px solid var(--axis);
  }
  .fill {
    display: block;
    height: 100%;
    max-height: 24px;
    border-radius: 0 4px 4px 0;
    background: var(--seq-2);
    transition: width 0.6s var(--ease);
  }
  .fill.top,
  .months .fill {
    background: var(--accent);
  }
  .val {
    font-weight: 600;
    font-size: 0.9rem;
    text-align: right;
  }
  .cnt {
    text-align: right;
  }
  .facts {
    margin: 0;
    display: grid;
    gap: 0;
  }
  .facts div {
    display: grid;
    grid-template-columns: 9.5em 1fr;
    gap: 12px;
    padding: 8px 0;
    border-top: 1px solid var(--grid);
    font-size: 0.9rem;
  }
  .facts div:first-child {
    border-top: 0;
    padding-top: 0;
  }
  .facts dt {
    color: var(--muted);
  }
  .facts dd {
    margin: 0;
    color: var(--ink-2);
  }
  .facts strong {
    color: var(--ink);
  }
  @media (max-width: 560px) {
    .facts div {
      grid-template-columns: 1fr;
      gap: 0;
    }
    .months li {
      grid-template-columns: 6em 1fr 5em;
    }
    .months .cnt {
      display: none;
    }
  }
</style>
