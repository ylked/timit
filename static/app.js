// ---------- helpers ----------

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function fmtDuration(seconds) {
  seconds = Math.max(0, Math.round(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function fmtSigned(seconds) {
  if (Math.abs(seconds) < 60) return "±0h 00m";
  return `${seconds > 0 ? "+" : "−"}${fmtDuration(Math.abs(seconds))}`;
}

function fmtHours(hours) {
  return `${+hours.toFixed(2)}h`;
}

// Classifies a week from /api/quota/weeks for colouring: over, under, met, progress, future, off, none.
function weekStatus(week) {
  if (week.quota_hours === null) return "none";
  const quota = week.quota_hours * 3600;
  if (quota === 0 && week.seconds < 60) return "off";
  if (week.state === "future") return "future";
  if (week.seconds >= quota) return week.seconds - quota >= 60 ? "over" : "met";
  return week.state === "current" ? "progress" : "under";
}

function fmtHHMMSS(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d) {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const res = new Date(d);
  res.setDate(d.getDate() - day);
  return res;
}

// Convert a stored ISO timestamp (no timezone) to a <input type=datetime-local> value.
function toLocalInputValue(iso) {
  return iso.slice(0, 16);
}

function fmtTimeShort(iso) {
  const [datePart, timePart] = iso.split("T");
  return timePart.slice(0, 5);
}

function fmtDateShort(iso) {
  return iso.slice(0, 10);
}

// ---------- tabs ----------

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "entries") loadEntriesTab();
    if (btn.dataset.tab === "calendar") loadCalendar();
    if (btn.dataset.tab === "export") loadExportTab();
  });
});

// ---------- timer ----------

let timerInterval = null;
let runningStart = null;

const timerDisplay = document.getElementById("timer-display");
const timerToggle = document.getElementById("timer-toggle");
const timerNote = document.getElementById("timer-note");

function tickTimer() {
  if (!runningStart) return;
  const elapsed = (Date.now() - runningStart.getTime()) / 1000;
  timerDisplay.textContent = fmtHHMMSS(elapsed);
}

function setRunningUI(running, entry) {
  if (running) {
    runningStart = new Date(entry.start_ts);
    timerToggle.textContent = "Stop";
    timerToggle.classList.add("running");
    timerNote.value = entry.note || "";
    timerNote.disabled = true;
    clearInterval(timerInterval);
    timerInterval = setInterval(tickTimer, 1000);
    tickTimer();
  } else {
    runningStart = null;
    clearInterval(timerInterval);
    timerToggle.textContent = "Start";
    timerToggle.classList.remove("running");
    timerNote.disabled = false;
    timerNote.value = "";
    timerDisplay.textContent = "00:00:00";
  }
}

async function refreshTimerStatus() {
  const status = await api("/api/timer/status");
  setRunningUI(status.running, status.entry);
}

timerToggle.addEventListener("click", async () => {
  timerToggle.disabled = true;
  try {
    if (runningStart) {
      await api("/api/timer/stop", { method: "POST" });
      setRunningUI(false);
    } else {
      const entry = await api("/api/timer/start", {
        method: "POST",
        body: JSON.stringify({ note: timerNote.value }),
      });
      setRunningUI(true, entry);
    }
    await refreshDashboard();
  } catch (e) {
    alert(e.message);
  } finally {
    timerToggle.disabled = false;
  }
});

// ---------- dashboard (today / week / today's entries) ----------

function renderEntryRow(entry, { showDate = false } = {}) {
  const row = document.createElement("div");
  row.className = "entry-row";
  const start = entry.start_ts;
  const end = entry.end_ts;
  const durationSec = end
    ? (new Date(end) - new Date(start)) / 1000
    : (Date.now() - new Date(start)) / 1000;

  row.innerHTML = `
    ${showDate ? `<span class="entry-date">${fmtDateShort(start)}</span>` : ""}
    <span class="entry-time">${fmtTimeShort(start)}–${end ? fmtTimeShort(end) : "now"}</span>
    <span class="entry-note">${entry.note ? escapeHtml(entry.note) : ""}</span>
    <span class="entry-duration">${fmtDuration(durationSec)}</span>
  `;
  row.addEventListener("click", () => openEditModal(entry));
  return row;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderEntriesList(container, entries, opts) {
  container.innerHTML = "";
  if (entries.length === 0) {
    container.innerHTML = '<div class="empty-state">No entries.</div>';
    return;
  }
  entries.forEach((entry) => container.appendChild(renderEntryRow(entry, opts)));
}

async function refreshDashboard() {
  const today = isoDate(new Date());
  const weekStart = isoDate(startOfWeek(new Date()));
  const weekEnd = isoDate(new Date());

  const [todayEntries, weekSummary, balance] = await Promise.all([
    api(`/api/entries?start=${today}&end=${today}`),
    api(`/api/summary/week?start=${weekStart}&end=${weekEnd}`),
    api("/api/quota/balance"),
  ]);

  const todayTotal = todayEntries.reduce((sum, e) => {
    const end = e.end_ts ? new Date(e.end_ts) : new Date();
    return sum + (end - new Date(e.start_ts)) / 1000;
  }, 0);
  document.getElementById("stat-today").textContent = fmtDuration(todayTotal);

  const weekTotal = weekSummary.reduce((sum, w) => sum + w.seconds, 0);
  document.getElementById("stat-week").textContent = fmtDuration(weekTotal);
  document.getElementById("stat-week-quota").textContent = describeCurrentWeek(balance.current_week);
  const balanceEl = document.getElementById("stat-balance");
  balanceEl.textContent = fmtSigned(balance.balance_seconds);
  balanceEl.className = `stat-value balance-${balanceSign(balance.balance_seconds)}`;

  renderEntriesList(
    document.getElementById("today-entries"),
    todayEntries.sort((a, b) => (a.start_ts < b.start_ts ? 1 : -1))
  );
}

// ---------- entries tab ----------

const entriesStartInput = document.getElementById("entries-start");
const entriesEndInput = document.getElementById("entries-end");

function setDefaultEntriesRange() {
  entriesStartInput.value = isoDate(startOfWeek(new Date()));
  entriesEndInput.value = isoDate(new Date());
}

async function loadEntriesTab() {
  if (!entriesStartInput.value) setDefaultEntriesRange();
  await filterEntries();
}

async function filterEntries() {
  const start = entriesStartInput.value;
  const end = entriesEndInput.value;
  const entries = await api(`/api/entries?start=${start}&end=${end}`);
  entries.sort((a, b) => (a.start_ts < b.start_ts ? 1 : -1));
  const total = entries.reduce((sum, e) => {
    const endT = e.end_ts ? new Date(e.end_ts) : new Date();
    return sum + (endT - new Date(e.start_ts)) / 1000;
  }, 0);
  document.getElementById("entries-total").innerHTML = `<strong>${fmtDuration(total)}</strong> total across ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`;
  renderEntriesList(document.getElementById("entries-table"), entries, { showDate: true });
}

document.getElementById("entries-filter").addEventListener("click", filterEntries);
document.getElementById("entries-add").addEventListener("click", () => openEditModal(null));

// ---------- edit/add modal ----------

const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const modalStart = document.getElementById("modal-start");
const modalEnd = document.getElementById("modal-end");
const modalNote = document.getElementById("modal-note");
const modalError = document.getElementById("modal-error");
const modalDelete = document.getElementById("modal-delete");

let editingEntryId = null;

function openEditModal(entry) {
  modalError.classList.add("hidden");
  if (entry) {
    editingEntryId = entry.id;
    modalTitle.textContent = `Entry #${entry.id}`;
    modalStart.value = toLocalInputValue(entry.start_ts);
    modalEnd.value = entry.end_ts ? toLocalInputValue(entry.end_ts) : "";
    modalNote.value = entry.note || "";
    modalDelete.classList.remove("hidden");
  } else {
    editingEntryId = null;
    modalTitle.textContent = "Add Entry";
    const now = new Date();
    modalStart.value = toLocalInputValue(now.toISOString());
    modalEnd.value = "";
    modalNote.value = "";
    modalDelete.classList.add("hidden");
  }
  modalOverlay.classList.remove("hidden");
}

function closeModal() {
  modalOverlay.classList.add("hidden");
}

document.getElementById("modal-cancel").addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

document.getElementById("modal-save").addEventListener("click", async () => {
  modalError.classList.add("hidden");
  if (!modalStart.value) {
    modalError.textContent = "Start time is required.";
    modalError.classList.remove("hidden");
    return;
  }
  const payload = {
    start_ts: modalStart.value,
    end_ts: modalEnd.value || null,
    note: modalNote.value,
  };
  try {
    if (editingEntryId) {
      await api(`/api/entries/${editingEntryId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api("/api/entries", { method: "POST", body: JSON.stringify(payload) });
    }
    closeModal();
    await refreshAll();
  } catch (e) {
    modalError.textContent = e.message;
    modalError.classList.remove("hidden");
  }
});

modalDelete.addEventListener("click", async () => {
  if (!editingEntryId) return;
  if (!confirm("Delete this entry?")) return;
  await api(`/api/entries/${editingEntryId}`, { method: "DELETE" });
  closeModal();
  await refreshAll();
});

async function refreshAll() {
  await refreshTimerStatus();
  await refreshDashboard();
  if (document.getElementById("tab-entries").classList.contains("active")) await filterEntries();
  if (document.getElementById("tab-calendar").classList.contains("active")) await loadCalendar();
  if (document.getElementById("tab-export").classList.contains("active")) await loadPeriods();
}

// ---------- calendar tab ----------

let calYear, calMonth; // calMonth is 1-12
let selectedDay = null;
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Week"];

function localIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function initCalendarState() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth() + 1;
}
initCalendarState();

async function loadCalendar() {
  const label = new Date(calYear, calMonth - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  document.getElementById("cal-label").textContent = label;

  const firstDay = new Date(calYear, calMonth - 1, 1);
  const leadingBlanks = (firstDay.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const trailingBlanks = (7 - ((leadingBlanks + daysInMonth) % 7)) % 7;
  // Weekly totals cover full weeks, including days that fall in adjacent months.
  const gridStart = new Date(calYear, calMonth - 1, 1 - leadingBlanks);
  const gridEnd = new Date(calYear, calMonth - 1, daysInMonth + trailingBlanks);

  const [totals, periodData, quotaWeeks, balance] = await Promise.all([
    api(`/api/calendar?year=${calYear}&month=${calMonth}`),
    api("/api/periods"),
    api(`/api/quota/weeks?start=${localIsoDate(gridStart)}&end=${localIsoDate(gridEnd)}`),
    api("/api/quota/balance"),
  ]);
  const weeksByStart = Object.fromEntries(quotaWeeks.map((w) => [w.week_start, w]));
  renderQuotaSummary(balance);
  const isSubmitted = (dateStr) =>
    periodData.periods.some((p) => p.start_date <= dateStr && dateStr <= p.end_date);
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  DOW_LABELS.forEach((d) => {
    const el = document.createElement("div");
    el.className = d === "Week" ? "cal-dow cal-week-dow" : "cal-dow";
    el.textContent = d;
    grid.appendChild(el);
  });

  const todayStr = isoDate(new Date());

  for (let i = 0; i < leadingBlanks; i++) {
    const el = document.createElement("div");
    el.className = "cal-day empty";
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const secs = totals[dateStr] || 0;
    const el = document.createElement("div");
    el.className = "cal-day";
    if (dateStr === todayStr) el.classList.add("today");
    if (dateStr === selectedDay) el.classList.add("selected");
    if (isSubmitted(dateStr)) {
      el.classList.add("submitted");
      el.title = "Submitted to HR";
    }
    el.innerHTML = `<span class="cal-day-num">${day}</span><span class="cal-day-hours">${secs > 0 ? fmtDuration(secs) : ""}</span>`;
    el.addEventListener("click", () => selectCalendarDay(dateStr));
    grid.appendChild(el);
    if ((leadingBlanks + day) % 7 === 0) appendWeekTotal(leadingBlanks + day);
  }

  for (let i = 0; i < trailingBlanks; i++) {
    const el = document.createElement("div");
    el.className = "cal-day empty";
    grid.appendChild(el);
  }
  if (trailingBlanks > 0) appendWeekTotal(leadingBlanks + daysInMonth + trailingBlanks);

  function appendWeekTotal(cellCount) {
    const weekStart = new Date(gridStart);
    weekStart.setDate(gridStart.getDate() + cellCount - 7);
    const week = weeksByStart[localIsoDate(weekStart)];
    const status = weekStatus(week);
    const el = document.createElement("div");
    el.className = `cal-week-total week-${status}`;
    let quotaLine = "";
    if (status === "off") quotaLine = week.note ? escapeHtml(week.note) : "off";
    else if (week.quota_hours !== null) quotaLine = `/ ${fmtHours(week.quota_hours)}`;
    el.innerHTML = `
      <span class="cal-week-worked">${week.seconds > 0 ? fmtDuration(week.seconds) : "—"}</span>
      <span class="cal-week-quota">${quotaLine}${week.is_override ? " ✎" : ""}</span>
    `;
    el.title = describeWeek(week);
    el.addEventListener("click", () => openWeekModal(week));
    grid.appendChild(el);
  }
}

function balanceSign(seconds) {
  if (Math.abs(seconds) < 60) return "zero";
  return seconds > 0 ? "over" : "under";
}

function describeCurrentWeek(week) {
  if (week.quota_hours === null) return "no quota";
  const left = week.quota_hours * 3600 - week.seconds;
  const quota = `of ${fmtHours(week.quota_hours)}`;
  if (left >= 60) return `${quota} · ${fmtDuration(left)} to go`;
  return `${quota} · ${fmtSigned(-left)} over`;
}

function describeWeek(week) {
  const parts = [`Week of ${week.week_start}`];
  if (week.quota_hours === null) {
    parts.push("before quota tracking started");
  } else {
    parts.push(`quota ${fmtHours(week.quota_hours)}${week.is_override ? " (custom)" : ""}`);
    if (week.state !== "future") parts.push(`${fmtSigned(week.seconds - week.quota_hours * 3600)} vs quota`);
  }
  if (week.note) parts.push(week.note);
  return parts.join(" · ");
}

function renderQuotaSummary(balance) {
  const sign = balanceSign(balance.balance_seconds);
  const since = balance.settings.start_date;
  document.getElementById("quota-summary").innerHTML = `
    <span>Balance: <strong class="balance-${sign}">${fmtSigned(balance.balance_seconds)}</strong>
    <span class="quota-muted">since ${since} (completed weeks)</span></span>
    <span>This week: <strong>${fmtDuration(balance.current_week.seconds)}</strong>
    <span class="quota-muted">${describeCurrentWeek(balance.current_week)}</span></span>
  `;
}

async function selectCalendarDay(dateStr) {
  selectedDay = dateStr;
  await loadCalendar();
  const title = document.getElementById("calendar-day-title");
  title.textContent = `Entries — ${dateStr}`;
  title.classList.remove("hidden");
  const entries = await api(`/api/entries?start=${dateStr}&end=${dateStr}`);
  entries.sort((a, b) => (a.start_ts < b.start_ts ? 1 : -1));
  renderEntriesList(document.getElementById("calendar-day-detail"), entries);
}

document.getElementById("cal-prev").addEventListener("click", () => {
  calMonth -= 1;
  if (calMonth < 1) { calMonth = 12; calYear -= 1; }
  loadCalendar();
});
document.getElementById("cal-next").addEventListener("click", () => {
  calMonth += 1;
  if (calMonth > 12) { calMonth = 1; calYear += 1; }
  loadCalendar();
});

// ---------- week quota modal ----------

const weekOverlay = document.getElementById("week-modal-overlay");
const weekHoursInput = document.getElementById("week-hours");
const weekNoteInput = document.getElementById("week-note");
const weekError = document.getElementById("week-modal-error");
const weekReset = document.getElementById("week-reset");

let editingWeek = null;

function openWeekModal(week) {
  editingWeek = week;
  weekError.classList.add("hidden");
  const end = new Date(`${week.week_start}T00:00:00`);
  end.setDate(end.getDate() + 6);
  document.getElementById("week-modal-title").textContent = `Week ${week.week_start} – ${localIsoDate(end)}`;
  document.getElementById("week-modal-worked").textContent = `Worked ${fmtDuration(week.seconds)}. ${describeWeek(week)}`;
  weekHoursInput.value = week.quota_hours ?? "";
  weekNoteInput.value = week.note || "";
  weekReset.classList.toggle("hidden", !week.is_override);
  weekOverlay.classList.remove("hidden");
  weekHoursInput.focus();
}

function closeWeekModal() {
  weekOverlay.classList.add("hidden");
}

document.getElementById("week-cancel").addEventListener("click", closeWeekModal);
weekOverlay.addEventListener("click", (e) => {
  if (e.target === weekOverlay) closeWeekModal();
});

document.getElementById("week-save").addEventListener("click", async () => {
  weekError.classList.add("hidden");
  if (weekHoursInput.value === "") {
    weekError.textContent = "Enter the number of hours (0 for a week off).";
    weekError.classList.remove("hidden");
    return;
  }
  try {
    await api(`/api/quota/weeks/${editingWeek.week_start}`, {
      method: "PUT",
      body: JSON.stringify({ hours: weekHoursInput.value, note: weekNoteInput.value }),
    });
    closeWeekModal();
    await refreshAll();
  } catch (e) {
    weekError.textContent = e.message;
    weekError.classList.remove("hidden");
  }
});

weekReset.addEventListener("click", async () => {
  await api(`/api/quota/weeks/${editingWeek.week_start}`, { method: "DELETE" });
  closeWeekModal();
  await refreshAll();
});

// ---------- quota settings modal ----------

const quotaOverlay = document.getElementById("quota-modal-overlay");
const quotaHoursInput = document.getElementById("quota-hours");
const quotaStartInput = document.getElementById("quota-start");
const quotaError = document.getElementById("quota-modal-error");

document.getElementById("quota-settings-btn").addEventListener("click", async () => {
  const settings = await api("/api/quota/settings");
  quotaError.classList.add("hidden");
  quotaHoursInput.value = settings.weekly_hours;
  quotaStartInput.value = settings.start_date_is_default ? "" : settings.start_date;
  quotaStartInput.placeholder = settings.start_date;
  quotaOverlay.classList.remove("hidden");
});

function closeQuotaModal() {
  quotaOverlay.classList.add("hidden");
}

document.getElementById("quota-cancel").addEventListener("click", closeQuotaModal);
quotaOverlay.addEventListener("click", (e) => {
  if (e.target === quotaOverlay) closeQuotaModal();
});

document.getElementById("quota-save").addEventListener("click", async () => {
  quotaError.classList.add("hidden");
  try {
    await api("/api/quota/settings", {
      method: "PUT",
      body: JSON.stringify({ weekly_hours: quotaHoursInput.value, start_date: quotaStartInput.value || null }),
    });
    closeQuotaModal();
    await refreshAll();
  } catch (e) {
    quotaError.textContent = e.message;
    quotaError.classList.remove("hidden");
  }
});

// ---------- export tab ----------

const exportStart = document.getElementById("export-start");
const exportEnd = document.getElementById("export-end");
const exportMark = document.getElementById("export-mark");
const exportError = document.getElementById("export-error");

let periodState = { periods: [], unsubmitted: null, suggested: null };

function buildQuery(start = exportStart.value, end = exportEnd.value) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  return params.toString();
}

function download(url) {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function showExportError(msg) {
  exportError.textContent = msg;
  exportError.classList.toggle("hidden", !msg);
}

function applySuggestedRange() {
  if (!periodState.suggested) return;
  exportStart.value = periodState.suggested.start;
  exportEnd.value = periodState.suggested.end;
  exportMark.checked = true;
}

async function loadExportTab() {
  await loadPeriods();
  if (!exportStart.value && !exportEnd.value) applySuggestedRange();
}

async function loadPeriods() {
  periodState = await api("/api/periods");
  renderUnsubmittedBanner();
  renderPeriods();
}

function renderUnsubmittedBanner() {
  const banner = document.getElementById("unsubmitted-banner");
  const { unsubmitted, suggested } = periodState;
  banner.classList.remove("hidden");
  if (!unsubmitted || unsubmitted.seconds <= 0) {
    banner.className = "unsubmitted-banner ok";
    banner.textContent = "✓ All recorded time has been submitted to HR.";
    return;
  }
  banner.className = "unsubmitted-banner";
  banner.innerHTML = `
    <span><strong>${fmtDuration(unsubmitted.seconds)}</strong> not yet submitted to HR
    (between ${unsubmitted.start} and ${unsubmitted.end}).</span>
    ${suggested ? `<button class="btn" id="use-suggested">Select ${suggested.start} – ${suggested.end}</button>` : ""}
  `;
  const btn = document.getElementById("use-suggested");
  if (btn) btn.addEventListener("click", applySuggestedRange);
}

function renderPeriods() {
  const container = document.getElementById("periods-table");
  container.innerHTML = "";
  if (periodState.periods.length === 0) {
    container.innerHTML = '<div class="empty-state">Nothing submitted yet.</div>';
    return;
  }
  periodState.periods.forEach((period) => {
    const row = document.createElement("div");
    row.className = "entry-row";
    const drift = Math.abs(period.current_seconds - period.seconds) >= 60;
    row.innerHTML = `
      <span class="entry-time">${period.start_date} – ${period.end_date}</span>
      <span class="entry-note">${period.note ? escapeHtml(period.note) : ""}</span>
      <span class="entry-date">submitted ${fmtDateShort(period.exported_at)}</span>
      ${drift ? `<span class="period-drift" title="Entries in this range changed after it was submitted">⚠ now ${fmtDuration(period.current_seconds)}</span>` : ""}
      <span class="entry-duration">${fmtDuration(period.seconds)}</span>
      <button class="btn btn-sm" title="Download Excel report for this period">⬇</button>
    `;
    row.querySelector("button").addEventListener("click", (e) => {
      e.stopPropagation();
      download(`/api/export/xlsx?${buildQuery(period.start_date, period.end_date)}`);
    });
    row.addEventListener("click", () => openPeriodModal(period));
    container.appendChild(row);
  });
}

async function doExport(kind) {
  showExportError("");
  const start = exportStart.value;
  const end = exportEnd.value;
  if (exportMark.checked) {
    if (!start || !end) {
      showExportError("Pick both a start and an end date to mark the range as submitted, or untick the checkbox.");
      return;
    }
    const alreadyMarked = periodState.periods.some((p) => p.start_date === start && p.end_date === end);
    if (!alreadyMarked) {
      try {
        await api("/api/periods", { method: "POST", body: JSON.stringify({ start_date: start, end_date: end }) });
      } catch (e) {
        showExportError(`${e.message}. Adjust the dates or untick the checkbox to export without marking.`);
        return;
      }
    }
  }
  download(`/api/export/${kind}?${buildQuery()}`);
  if (exportMark.checked) await loadPeriods();
}

document.getElementById("export-xlsx").addEventListener("click", () => doExport("xlsx"));
document.getElementById("export-csv").addEventListener("click", () => doExport("csv"));
document.getElementById("export-json").addEventListener("click", () => doExport("json"));
document.getElementById("export-backup").addEventListener("click", () => {
  window.open("/api/backup", "_blank");
});

// ---------- pay period modal ----------

const periodOverlay = document.getElementById("period-modal-overlay");
const periodStartInput = document.getElementById("period-start");
const periodEndInput = document.getElementById("period-end");
const periodExportedInput = document.getElementById("period-exported");
const periodNoteInput = document.getElementById("period-note");
const periodResyncRow = document.getElementById("period-resync-row");
const periodResync = document.getElementById("period-resync");
const periodError = document.getElementById("period-modal-error");
const periodDelete = document.getElementById("period-delete");

let editingPeriodId = null;

function openPeriodModal(period) {
  periodError.classList.add("hidden");
  periodResync.checked = false;
  if (period) {
    editingPeriodId = period.id;
    document.getElementById("period-modal-title").textContent = "Edit Submitted Period";
    periodStartInput.value = period.start_date;
    periodEndInput.value = period.end_date;
    periodExportedInput.value = toLocalInputValue(period.exported_at);
    periodNoteInput.value = period.note || "";
    const drift = Math.abs(period.current_seconds - period.seconds) >= 60;
    periodResyncRow.classList.toggle("hidden", !drift);
    document.getElementById("period-resync-label").textContent =
      `Update recorded hours from ${fmtDuration(period.seconds)} to current ${fmtDuration(period.current_seconds)}`;
    periodDelete.classList.remove("hidden");
  } else {
    editingPeriodId = null;
    document.getElementById("period-modal-title").textContent = "Add Submitted Period";
    periodStartInput.value = periodState.suggested ? periodState.suggested.start : "";
    periodEndInput.value = periodState.suggested ? periodState.suggested.end : "";
    periodExportedInput.value = "";
    periodNoteInput.value = "";
    periodResyncRow.classList.add("hidden");
    periodDelete.classList.add("hidden");
  }
  periodOverlay.classList.remove("hidden");
}

function closePeriodModal() {
  periodOverlay.classList.add("hidden");
}

document.getElementById("period-add").addEventListener("click", () => openPeriodModal(null));
document.getElementById("period-cancel").addEventListener("click", closePeriodModal);
periodOverlay.addEventListener("click", (e) => {
  if (e.target === periodOverlay) closePeriodModal();
});

document.getElementById("period-save").addEventListener("click", async () => {
  periodError.classList.add("hidden");
  const payload = {
    start_date: periodStartInput.value,
    end_date: periodEndInput.value,
    exported_at: periodExportedInput.value || null,
    note: periodNoteInput.value,
    resync: periodResync.checked,
  };
  try {
    if (editingPeriodId) {
      await api(`/api/periods/${editingPeriodId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api("/api/periods", { method: "POST", body: JSON.stringify(payload) });
    }
    closePeriodModal();
    await loadPeriods();
  } catch (e) {
    periodError.textContent = e.message;
    periodError.classList.remove("hidden");
  }
});

periodDelete.addEventListener("click", async () => {
  if (!editingPeriodId) return;
  if (!confirm("Delete this period? Its hours will count as not submitted again.")) return;
  await api(`/api/periods/${editingPeriodId}`, { method: "DELETE" });
  closePeriodModal();
  await loadPeriods();
});

// ---------- init ----------

(async function init() {
  setDefaultEntriesRange();
  await refreshTimerStatus();
  await refreshDashboard();
})();
