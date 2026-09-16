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

  const [todayEntries, weekSummary] = await Promise.all([
    api(`/api/entries?start=${today}&end=${today}`),
    api(`/api/summary/week?start=${weekStart}&end=${weekEnd}`),
  ]);

  const todayTotal = todayEntries.reduce((sum, e) => {
    const end = e.end_ts ? new Date(e.end_ts) : new Date();
    return sum + (end - new Date(e.start_ts)) / 1000;
  }, 0);
  document.getElementById("stat-today").textContent = fmtDuration(todayTotal);

  const weekTotal = weekSummary.reduce((sum, w) => sum + w.seconds, 0);
  document.getElementById("stat-week").textContent = fmtDuration(weekTotal);

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
}

// ---------- calendar tab ----------

let calYear, calMonth; // calMonth is 1-12
let selectedDay = null;
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function initCalendarState() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth() + 1;
}
initCalendarState();

async function loadCalendar() {
  const label = new Date(calYear, calMonth - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  document.getElementById("cal-label").textContent = label;

  const totals = await api(`/api/calendar?year=${calYear}&month=${calMonth}`);
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  DOW_LABELS.forEach((d) => {
    const el = document.createElement("div");
    el.className = "cal-dow";
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(calYear, calMonth - 1, 1);
  const leadingBlanks = (firstDay.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
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
    el.innerHTML = `<span class="cal-day-num">${day}</span><span class="cal-day-hours">${secs > 0 ? fmtDuration(secs) : ""}</span>`;
    el.addEventListener("click", () => selectCalendarDay(dateStr));
    grid.appendChild(el);
  }
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

// ---------- export tab ----------

function buildQuery() {
  const start = document.getElementById("export-start").value;
  const end = document.getElementById("export-end").value;
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  return params.toString();
}

document.getElementById("export-xlsx").addEventListener("click", () => {
  window.open(`/api/export/xlsx?${buildQuery()}`, "_blank");
});
document.getElementById("export-csv").addEventListener("click", () => {
  window.open(`/api/export/csv?${buildQuery()}`, "_blank");
});
document.getElementById("export-json").addEventListener("click", () => {
  window.open(`/api/export/json?${buildQuery()}`, "_blank");
});
document.getElementById("export-backup").addEventListener("click", () => {
  window.open("/api/backup", "_blank");
});

// ---------- init ----------

(async function init() {
  setDefaultEntriesRange();
  await refreshTimerStatus();
  await refreshDashboard();
})();
