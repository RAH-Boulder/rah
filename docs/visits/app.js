/* Supervisory visits: when each client's next 90-day supervisory visit is due.
 * Saved in this browser (localStorage) and, when connected, in a private Google Sheet.
 * No server, no build step. All dates are "YYYY-MM-DD" strings. */
(function () {
  "use strict";

  const CONFIG = Object.assign({ intervalDays: 90, dueSoonDays: 14, sheetUrl: "" }, window.VISITS_CONFIG || {});
  const STORE_KEY = "rah-visits-v1";
  const FIELDS = ["first", "last", "lastVisit", "nextDue", "scheduled", "notes", "holdReason"];
  const DATE_FIELDS = ["lastVisit", "nextDue", "scheduled"];

  // ---------- Storage ----------
  function loadState() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* ignore */ }
    if (!s || typeof s !== "object") s = {};
    s.clients = Array.isArray(s.clients) ? s.clients : [];
    s.removed = s.removed && typeof s.removed === "object" ? s.removed : {}; // id -> when deleted
    s.settings = Object.assign({ sort: "nextDue", dir: 1, showInactive: false }, s.settings || {});
    return s;
  }
  let state = loadState();
  function save(changed) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast("Couldn't save — your browser storage may be full or turned off."); }
    if (changed) scheduleSync();
  }
  const stamp = () => new Date().toISOString();
  const uid = () => "v-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- Dates ----------
  const pad = n => String(n).padStart(2, "0");
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  function today() { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
  const ms = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const fromMs = t => { const d = new Date(t); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
  const addDays = (s, n) => fromMs(ms(s) + n * 864e5);
  const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / 864e5); // b - a
  const weekday = s => new Date(ms(s)).getUTCDay(); // 0 Sun … 6 Sat

  // Closest weekday: Saturday → Friday before, Sunday → Monday after.
  function closestWeekday(s) {
    const w = weekday(s);
    return w === 6 ? addDays(s, -1) : w === 0 ? addDays(s, 1) : s;
  }
  // Next visit: 90 days after the last visit, on the closest weekday.
  const nextVisit = s => (isDate(s) ? closestWeekday(addDays(s, CONFIG.intervalDays)) : "");

  function fmt(s) { if (!isDate(s)) return ""; const [y, m, d] = s.split("-"); return `${m}/${d}/${y}`; }
  function fmtLong(s) {
    if (!isDate(s)) return "";
    return new Date(ms(s)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  function fmtShort(s) {
    if (!isDate(s)) return "";
    return new Date(ms(s)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  }
  // Dates from the sheet: 2026-11-17, 11/17/2026, 11/17/26, 11-17-2026.
  function parseDate(v) {
    const s = String(v == null ? "" : v).trim();
    if (!s) return "";
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return valid(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
    if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
    return null; // not a date
  }
  function valid(y, m, d) {
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? iso(y, m, d) : null;
  }

  // ---------- Helpers ----------
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fullName = c => `${c.first || ""} ${c.last || ""}`.trim();
  const nameKey = (f, l) => `${f || ""} ${l || ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, " ").trim();
  const byId = id => state.clients.find(c => c.id === id);
  const active = () => state.clients.filter(c => !c.inactive);
  const tracked = () => active().filter(c => !c.onHold); // on hold: off the due list

  // Status: Active, On hold (still a client, off the due list), or Ended care / Deceased
  // (no longer a client: off every list, record kept).
  const STATUS = [["active", "Active"], ["hold", "On hold"], ["ended", "Ended care"], ["deceased", "Deceased"]];
  const statusLabel = k => (STATUS.find(x => x[0] === k) || STATUS[0])[1];
  const statusOf = c => (c.inactive ? (c.endReason === "deceased" ? "deceased" : "ended") : c.onHold ? "hold" : "active");
  function statusSelect(c) {
    const cur = statusOf(c);
    return `<select class="status-select" data-status="${esc(c.id)}" aria-label="Status for ${esc(fullName(c))}">${STATUS.map(([k, l]) =>
      `<option value="${k}"${k === cur ? " selected" : ""}>${l}</option>`).join("")}</select>`;
  }
  const cmpName = (a, b) => (a.last || "").localeCompare(b.last || "") || (a.first || "").localeCompare(b.first || "");
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  let toastTimer = null, undoFn = null;
  function toast(msg, undo) {
    $("#toast-msg").textContent = msg;
    undoFn = undo || null;
    $("#toast-undo").hidden = !undo;
    $("#toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $("#toast").hidden = true; undoFn = null; }, undo ? 8000 : 3500);
  }
  $("#toast-undo").addEventListener("click", () => { if (undoFn) undoFn(); $("#toast").hidden = true; undoFn = null; });

  // ---------- Lists ----------
  // Due list: overdue, due within dueSoonDays, or with a visit scheduled within dueSoonDays.
  function dueRows() {
    const t = today(), lim = CONFIG.dueSoonDays;
    return tracked().filter(c => (isDate(c.nextDue) && daysBetween(t, c.nextDue) <= lim) || (isDate(c.scheduled) && daysBetween(t, c.scheduled) <= lim))
      .map(c => ({ c, key: c.nextDue || c.scheduled, days: isDate(c.nextDue) ? daysBetween(t, c.nextDue) : null }))
      .sort((a, b) => a.key.localeCompare(b.key) || cmpName(a.c, b.c));
  }
  function missingRows() {
    return tracked().filter(c => !isDate(c.lastVisit) && !isDate(c.nextDue) && !isDate(c.scheduled)).sort(cmpName);
  }

  function dueStatus(days) {
    if (days == null) return { cls: "", text: "First visit" };
    if (days < 0) return { cls: "late", text: `Overdue by ${plural(-days, "day")}` };
    if (days === 0) return { cls: "late", text: "Due today" };
    if (days === 1) return { cls: "soon", text: "Due tomorrow" };
    return { cls: days <= 7 ? "soon" : "", text: `Due in ${days} days` };
  }
  function schedText(c) {
    if (!isDate(c.scheduled)) return { cls: "none", text: "Not scheduled yet" };
    const n = daysBetween(today(), c.scheduled);
    if (n < 0) return { cls: "none", text: `Was scheduled for ${fmtShort(c.scheduled)} — mark it completed, or enter a new date` };
    const when = n === 0 ? "today" : n === 1 ? "tomorrow" : fmtShort(c.scheduled);
    if (isDate(c.nextDue) && c.scheduled > c.nextDue) return { cls: "none", text: `Scheduled ${when} — after the due date` };
    return { cls: "ok", text: `Scheduled ${when}` };
  }

  function renderDue() {
    const rows = dueRows(), by = addDays(today(), CONFIG.dueSoonDays);
    const overdue = rows.filter(r => r.days != null && r.days < 0).length;
    const unsched = rows.filter(r => !isDate(r.c.scheduled) || r.c.scheduled < today()).length;
    $("#overdue-count").textContent = overdue;
    $("#overdue-count").parentElement.classList.toggle("hot", overdue > 0);
    $("#soon-count").textContent = rows.length - overdue;
    $("#soon-label").textContent = `Due in next ${CONFIG.dueSoonDays % 7 ? CONFIG.dueSoonDays + " days" : plural(CONFIG.dueSoonDays / 7, "week")}`;
    $("#unsched-count").textContent = unsched;
    $("#unsched-count").parentElement.classList.toggle("hot", unsched > 0);
    $("#due-sub").textContent = `Overdue, or due in the next ${CONFIG.dueSoonDays} days (by ${fmtLong(by)}). Each visit is due ${CONFIG.intervalDays} days after the last one, on the closest weekday.`;
    $("#copy-list-btn").hidden = $("#print-btn").hidden = !rows.length;
    $("#due-list").innerHTML = rows.length ? rows.map(r => {
      const st = dueStatus(r.days), sc = schedText(r.c), id = esc(r.c.id);
      const has = isDate(r.c.scheduled) && r.c.scheduled >= today();
      return `<div class="row">
        <div class="row-main">
          <button type="button" class="row-name" data-edit="${id}">${esc(fullName(r.c))}</button>
          <span class="row-what">${isDate(r.c.nextDue) ? `Due ${fmtLong(r.c.nextDue)}` : "First visit"}${isDate(r.c.lastVisit) ? ` · last visit ${fmt(r.c.lastVisit)}` : ""}</span>
          <span class="row-status ${st.cls}">${st.text}</span>
          <span class="row-sched ${sc.cls}">${esc(sc.text)}</span>
        </div>
        <div class="row-btns">
          <button type="button" class="btn small${has ? " ghost" : ""}" data-sched="${id}">${isDate(r.c.scheduled) ? "Change scheduled date" : "Enter scheduled date"}</button>
          <button type="button" class="btn small${has ? "" : " ghost"}" data-done="${id}">Mark completed</button>
          ${statusSelect(r.c)}
        </div>
      </div>`;
    }).join("") : `<p class="all-clear">✓ No supervisory visits are overdue or due in the next ${CONFIG.dueSoonDays} days.</p>`;
  }

  function renderMissing() {
    const rows = missingRows();
    $("#missing-count").textContent = rows.length;
    $("#missing-sum").textContent = `(${rows.length}) — click to show`;
    $("#missing-card").hidden = !rows.length;
    $("#missing-count").parentElement.hidden = !rows.length;
    $("#missing-list").innerHTML = rows.map(c => `<div class="row compact">
      <div class="row-main"><button type="button" class="row-name" data-edit="${esc(c.id)}" data-focus="lastVisit">${esc(fullName(c))}</button>
      <span class="row-what">No visit dates</span></div>
      <div class="row-btns"><button type="button" class="btn small ghost" data-edit="${esc(c.id)}" data-focus="lastVisit">Add last visit</button></div>
    </div>`).join("");
  }

  function renderHold() {
    const rows = active().filter(c => c.onHold).sort(cmpName);
    $("#hold-card").hidden = !rows.length;
    $("#hold-count").textContent = rows.length;
    $("#hold-count").parentElement.hidden = !rows.length;
    $("#hold-list").innerHTML = rows.map(c => {
      const n = isDate(c.nextDue) ? daysBetween(today(), c.nextDue) : null;
      const due = isDate(c.nextDue) ? `${n < 0 ? "Was due" : "Due"} ${fmtLong(c.nextDue)}` : "No due date";
      return `<div class="row compact">
        <div class="row-main"><button type="button" class="row-name" data-edit="${esc(c.id)}">${esc(fullName(c))}</button>
        <span class="row-what">${esc(c.holdReason || "On hold")}${c.holdSince ? ` · since ${fmt(c.holdSince)}` : ""}</span>
        <span class="row-what">${due}${isDate(c.lastVisit) ? ` · last visit ${fmt(c.lastVisit)}` : ""}</span></div>
        <div class="row-btns">${statusSelect(c)}</div>
      </div>`;
    }).join("");
  }

  function cellDate(s, cls) {
    if (!isDate(s)) return `<td class="none">—</td>`;
    return `<td class="${cls || ""}">${fmt(s)}</td>`;
  }
  function renderRoster() {
    const q = nameKey($("#search").value, "");
    const list = state.clients.filter(c => (state.settings.showInactive || !c.inactive) && (!q || nameKey(c.first, c.last).includes(q)));
    const k = state.settings.sort, dir = state.settings.dir;
    list.sort((a, b) => {
      if (k === "name") return dir * cmpName(a, b);
      const av = a[k] || "", bv = b[k] || "";
      if (!av !== !bv) return av ? -1 : 1; // blanks last
      return dir * av.localeCompare(bv) || cmpName(a, b);
    });
    document.querySelectorAll("[data-sort]").forEach(b => {
      b.parentElement.setAttribute("aria-sort", b.dataset.sort === k ? (dir > 0 ? "ascending" : "descending") : "none");
    });
    const t = today();
    $("#all-count").textContent = `${active().length} active`;
    $("#roster").innerHTML = list.map(c => {
      const n = isDate(c.nextDue) ? daysBetween(t, c.nextDue) : null;
      const dueCls = n == null || c.onHold ? "" : n < 0 ? "late" : n <= CONFIG.dueSoonDays ? "soon" : "";
      const schedCls = isDate(c.scheduled) && c.scheduled >= t ? "sched" : "";
      return `<tr data-edit="${esc(c.id)}" class="${c.inactive ? "inactive" : ""}" tabindex="0">
        <td class="name">${esc(fullName(c))}${c.inactive ? ` <span class="tag">${statusLabel(statusOf(c)).toLowerCase()}${c.endedOn ? " " + fmt(c.endedOn) : ""}</span>` : c.onHold ? ' <span class="tag hold">on hold</span>' : ""}</td>
        ${cellDate(c.lastVisit)}${cellDate(c.nextDue, dueCls)}${cellDate(c.scheduled, schedCls)}
        <td class="act-col">${c.inactive ? "" : `<button type="button" class="btn small ghost grey" data-sched="${esc(c.id)}">Schedule</button>
          <button type="button" class="btn small ghost grey" data-done="${esc(c.id)}">Completed</button>`}
          ${statusSelect(c)}
          <button type="button" class="btn small ghost grey" data-remove="${esc(c.id)}">Remove</button></td>
      </tr>`;
    }).join("");
    $("#roster-empty").hidden = state.clients.length > 0;
  }

  let renderedDay = "";
  function renderAll() {
    renderedDay = today();
    if (!unlocked()) { // locked: keep every client name out of the page
      ["#due-list", "#hold-list", "#missing-list", "#roster"].forEach(sel => { $(sel).innerHTML = ""; });
      return;
    }
    $("#today").textContent = "Today: " + fmtLong(renderedDay);
    renderDue(); renderHold(); renderMissing(); renderRoster();
  }

  // ---------- Clicks ----------
  document.addEventListener("click", e => {
    if (e.target.closest("select")) return; // the status dropdown (inside a clickable row)
    const t = e.target.closest("[data-edit],[data-done],[data-sched],[data-remove],[data-sort],[data-close]");
    if (!t) return;
    if (t.dataset.close !== undefined) { t.closest("dialog").close(); return; }
    if (t.dataset.sort) {
      if (state.settings.sort === t.dataset.sort) state.settings.dir *= -1; else { state.settings.sort = t.dataset.sort; state.settings.dir = 1; }
      save(); renderRoster(); return;
    }
    if (t.dataset.done) { openDone(t.dataset.done); return; }
    if (t.dataset.sched) { openSched(t.dataset.sched); return; }
    if (t.dataset.remove) { removeClient(t.dataset.remove); return; }
    if (t.dataset.edit) openEdit(t.dataset.edit, t.dataset.focus);
  });
  document.addEventListener("change", e => {
    const sel = e.target.closest("select[data-status]");
    if (!sel) return;
    const c = byId(sel.dataset.status), st = sel.value;
    if (!c) return;
    if (st === "hold") { openHold(c.id); return; }
    if ((st === "ended" || st === "deceased") && !confirm(`Mark ${fullName(c)} as ${statusLabel(st).toLowerCase()}? They'll come off the visit lists. Their record is kept (tick "Show ended care & deceased" under All clients to see it).`)) { renderAll(); return; }
    setStatus(c.id, st);
  });
  $("#roster").addEventListener("keydown", e => {
    const tr = e.target.closest("tr[data-edit]");
    if (tr && e.target === tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openEdit(tr.dataset.edit); }
  });
  $("#search").addEventListener("input", renderRoster);
  $("#show-inactive").checked = !!state.settings.showInactive;
  $("#show-inactive").addEventListener("change", e => { state.settings.showInactive = e.target.checked; save(); renderRoster(); });
  $("#add-btn").addEventListener("click", () => openEdit(null));
  document.querySelector('a[href="#hold-card"]').addEventListener("click", () => { $("#hold-card details").open = true; });
  document.querySelector('a[href="#missing-card"]').addEventListener("click", () => { $("#missing-card details").open = true; });

  // Copy the due list as plain text, to paste into an email or message.
  $("#copy-list-btn").addEventListener("click", async () => {
    const rows = dueRows();
    const lines = [`Supervisory visits due by ${fmt(addDays(today(), CONFIG.dueSoonDays))} (as of ${fmt(today())}):`];
    rows.forEach(r => {
      const st = dueStatus(r.days).text.toLowerCase();
      const due = isDate(r.c.nextDue) ? `due ${fmt(r.c.nextDue)} (${st})` : "first visit";
      const sc = isDate(r.c.scheduled) ? `scheduled ${fmt(r.c.scheduled)}` : "not scheduled yet";
      lines.push(`- ${fullName(r.c)}: ${due}, ${sc}`);
    });
    const text = lines.join("\n");
    try { await navigator.clipboard.writeText(text); toast("List copied — paste it into an email or message."); }
    catch (err) { window.prompt("Copy this list:", text); }
  });
  $("#print-btn").addEventListener("click", () => window.print());

  // ---------- Add / edit ----------
  const ed = $("#edit-dialog"), edForm = $("#edit-form");
  let editingId = null, visitAtOpen = "";
  function openEdit(id, focus) {
    const c = id ? byId(id) : null;
    editingId = c ? c.id : null;
    edForm.reset();
    $("#ed-title").textContent = c ? fullName(c) : "Add client";
    $("#ed-visit-label").textContent = c ? "Last completed visit" : "First visit date";
    $("#ed-delete").hidden = !c;
    FIELDS.forEach(f => { edForm.elements[f].value = c ? (c[f] || "") : ""; });
    $("#ed-more-fields").hidden = !c;
    edForm.elements.lastVisit.required = !c;
    $("#ed-status-wrap").hidden = !c;
    edForm.elements.status.value = c ? statusOf(c) : "active";
    holdReasonShown();
    visitAtOpen = c ? c.lastVisit || "" : "";
    lastVisitSeen = visitAtOpen;
    edHint();
    ed.showModal();
    const el = edForm.elements[focus || (c ? "" : "first")];
    if (el) { el.focus(); if (el.select) try { el.select(); } catch (e) { /* date inputs */ } }
  }
  // While the due date is still the one worked out from the last visit (or blank), changing
  // the last visit moves it too.
  let lastVisitSeen = "";
  edForm.elements.lastVisit.addEventListener("change", () => {
    const due = edForm.elements.nextDue, v = edForm.elements.lastVisit.value;
    if (editingId && (!due.value || due.value === nextVisit(lastVisitSeen) || due.value === nextVisit(visitAtOpen))) due.value = nextVisit(v);
    lastVisitSeen = v;
    edHint();
  });
  edForm.elements.nextDue.addEventListener("change", edHint);
  function holdReasonShown() { $("#ed-hold-reason").hidden = edForm.elements.status.value !== "hold"; }
  edForm.elements.status.addEventListener("change", holdReasonShown);
  function edHint() {
    const v = edForm.elements.lastVisit.value, due = edForm.elements.nextDue.value;
    let msg = "";
    if (!editingId) {
      if (!isDate(v)) msg = `Enter the date of the first visit. Each next visit is due ${CONFIG.intervalDays} days after the last one.`;
      else if (v > today()) msg = `This visit hasn't happened yet, so it will be listed as scheduled for ${fmtLong(v)}. Click Mark completed after the visit to start the ${CONFIG.intervalDays}-day count.`;
      else msg = `Next visit will be due ${fmtLong(nextVisit(v))} (${CONFIG.intervalDays} days later, on the closest weekday).`;
    } else if (isDate(v) && !isDate(due)) msg = `Next visit would be due ${fmtLong(nextVisit(v))}.`;
    else if (isDate(due) && weekday(due) % 6 === 0) msg = "Note: this due date is on a weekend.";
    else if (isDate(v) && due === nextVisit(v)) msg = `Next due is ${CONFIG.intervalDays} days after this visit, on the closest weekday.`;
    $("#ed-hint").textContent = msg;
  }

  edForm.addEventListener("submit", e => {
    e.preventDefault();
    const v = {};
    FIELDS.forEach(f => { v[f] = edForm.elements[f].value.trim(); });
    if (!v.first || !v.last) return;
    if (!editingId) {
      if (!isDate(v.lastVisit)) return;
      if (v.lastVisit > today()) { v.scheduled = v.nextDue = v.lastVisit; v.lastVisit = ""; }
      else { v.nextDue = nextVisit(v.lastVisit); v.scheduled = ""; }
    } else if (!v.nextDue && isDate(v.lastVisit)) v.nextDue = nextVisit(v.lastVisit);
    const prev = editingId ? byId(editingId) : null;
    Object.assign(v, statusFields(editingId ? edForm.elements.status.value : "active", v.holdReason, prev));
    const dup = state.clients.find(c => c.id !== editingId && nameKey(c.first, c.last) === nameKey(v.first, v.last));
    if (dup && !confirm(`${fullName(dup)} is already on the list. Save anyway?`)) return;
    if (editingId) {
      Object.assign(byId(editingId), v, { updated: stamp() });
      toast(`Saved ${v.first} ${v.last}.`);
    } else {
      state.clients.push(Object.assign({ id: uid() }, v, { updated: stamp() }));
      toast(`Added ${v.first} ${v.last}.` + (v.lastVisit ? ` Next visit due ${fmt(v.nextDue)}.` : ` First visit scheduled ${fmt(v.scheduled)}.`));
    }
    save(true); ed.close(); renderAll();
  });

  $("#ed-delete").addEventListener("click", () => { if (removeClient(editingId)) ed.close(); });
  function removeClient(id) {
    const c = byId(id);
    if (!c) return false;
    if (!confirm(`Remove ${fullName(c)} from the client list?`)) return false;
    state.clients = state.clients.filter(x => x.id !== c.id);
    state.removed[c.id] = stamp();
    save(true); renderAll();
    toast(`Removed ${fullName(c)}.`, () => {
      delete state.removed[c.id];
      c.updated = stamp(); state.clients.push(c);
      save(true); renderAll();
    });
    return true;
  }

  // ---------- Scheduled visit ----------
  const sd = $("#sched-dialog"), sdForm = $("#sched-form");
  let schedId = null;
  function openSched(id) {
    const c = byId(id);
    if (!c) return;
    schedId = id;
    $("#sd-title").textContent = fullName(c);
    $("#sd-info").textContent = isDate(c.nextDue) ? `Next visit is due ${fmtLong(c.nextDue)}.` : "First visit.";
    sdForm.elements.date.value = c.scheduled || "";
    $("#sd-clear").hidden = !c.scheduled;
    sdHint();
    sd.showModal();
    sdForm.elements.date.focus();
  }
  function sdHint() {
    const c = byId(schedId), d = sdForm.elements.date.value;
    let msg = "";
    if (c && isDate(d)) {
      if (weekday(d) % 6 === 0) msg = "Note: this is on a weekend. ";
      if (isDate(c.nextDue) && d > c.nextDue) msg += `This is ${plural(daysBetween(c.nextDue, d), "day")} after the due date.`;
      else if (d < today()) msg += "This date is in the past. If the visit already happened, use Mark completed instead.";
    }
    $("#sd-hint").textContent = msg;
    $("#sd-hint").classList.toggle("warn-text", !!msg);
  }
  sdForm.elements.date.addEventListener("input", sdHint);
  sdForm.addEventListener("submit", e => {
    e.preventDefault();
    const c = byId(schedId), d = sdForm.elements.date.value;
    if (!c || !isDate(d)) return;
    const before = c.scheduled || "";
    c.scheduled = d; c.updated = stamp();
    save(true); sd.close(); renderAll();
    toast(`${fullName(c)}: visit scheduled ${fmt(d)}.`, () => { c.scheduled = before; c.updated = stamp(); save(true); renderAll(); });
  });
  $("#sd-clear").addEventListener("click", () => {
    const c = byId(schedId);
    if (!c) return;
    const before = c.scheduled;
    c.scheduled = ""; c.updated = stamp();
    save(true); sd.close(); renderAll();
    toast(`${fullName(c)}: scheduled date cleared.`, () => { c.scheduled = before; c.updated = stamp(); save(true); renderAll(); });
  });

  // ---------- On hold ----------
  const hd = $("#hold-dialog"), hdForm = $("#hold-form");
  let holdId = null;
  function openHold(id) {
    const c = byId(id);
    if (!c) return;
    holdId = id;
    $("#hd-title").textContent = fullName(c);
    hdForm.elements.reason.value = c.holdReason || "";
    hd.showModal();
    hdForm.elements.reason.focus();
  }
  hdForm.addEventListener("submit", e => {
    e.preventDefault();
    const id = holdId;
    holdId = null;
    hd.close();
    setStatus(id, "hold", hdForm.elements.reason.value.trim());
  });
  hd.addEventListener("close", () => { if (holdId) { holdId = null; renderAll(); } }); // cancelled: reset the dropdown

  // The fields that go with each status. `prev` keeps the start date when nothing changed.
  function statusFields(st, reason, prev) {
    const was = prev ? statusOf(prev) : "active";
    const f = { onHold: false, holdReason: "", holdSince: "", inactive: false, endReason: "", endedOn: "" };
    if (st === "hold") Object.assign(f, { onHold: true, holdReason: reason || "", holdSince: (was === "hold" && prev.holdSince) || today() });
    if (st === "ended" || st === "deceased") Object.assign(f, { inactive: true, endReason: st, endedOn: (was === st && prev.endedOn) || today() });
    return f;
  }
  function setStatus(id, st, reason) {
    const c = byId(id);
    if (!c) return;
    const was = statusOf(c);
    const before = { onHold: !!c.onHold, holdReason: c.holdReason || "", holdSince: c.holdSince || "", inactive: !!c.inactive, endReason: c.endReason || "", endedOn: c.endedOn || "" };
    Object.assign(c, statusFields(st, reason, c), { updated: stamp() });
    save(true); renderAll();
    let msg;
    if (st === "hold") msg = `${fullName(c)} is on hold and off the due list.`;
    else if (st === "ended") msg = `${fullName(c)}: care ended. They're off the visit lists.`;
    else if (st === "deceased") msg = `${fullName(c)} is marked deceased and is off the visit lists.`;
    else {
      msg = was === "hold" ? `${fullName(c)} is off hold.` : `${fullName(c)} is an active client again.`;
      if (isDate(c.nextDue) && daysBetween(today(), c.nextDue) < 0) msg += ` Their visit was due ${fmt(c.nextDue)}, so they're on the overdue list.`;
    }
    toast(msg, () => { Object.assign(c, before, { updated: stamp() }); save(true); renderAll(); });
  }

  // ---------- Visit completed ----------
  const dd = $("#done-dialog"), ddForm = $("#done-form");
  let doneId = null;
  function openDone(id) {
    const c = byId(id);
    if (!c) return;
    doneId = id;
    $("#dd-title").textContent = fullName(c);
    const parts = [];
    if (isDate(c.nextDue)) parts.push(`Due ${fmtLong(c.nextDue)}.`);
    if (isDate(c.scheduled)) parts.push(`Scheduled ${fmtLong(c.scheduled)}.`);
    $("#dd-info").textContent = parts.join(" ") || "Enter the date the visit took place.";
    ddForm.elements.completed.value = isDate(c.scheduled) && c.scheduled <= today() ? c.scheduled : today();
    ddNext();
    dd.showModal();
  }
  function ddNext() {
    const d = ddForm.elements.completed.value;
    $("#dd-next").innerHTML = isDate(d)
      ? `Next visit will be due <b>${esc(fmtLong(nextVisit(d)))}</b> (${CONFIG.intervalDays} days after this visit, on the closest weekday).`
      : "Enter the date the visit took place.";
  }
  ddForm.elements.completed.addEventListener("input", ddNext);
  ddForm.addEventListener("submit", e => {
    e.preventDefault();
    const c = byId(doneId), when = ddForm.elements.completed.value;
    if (!c || !isDate(when)) return;
    if (when > today() && !confirm(`${fmt(when)} is in the future. Mark the visit completed anyway?`)) return;
    const before = { lastVisit: c.lastVisit, nextDue: c.nextDue, scheduled: c.scheduled };
    c.lastVisit = when;
    c.nextDue = nextVisit(when);
    c.scheduled = "";
    c.updated = stamp();
    save(true); dd.close(); renderAll();
    toast(`${fullName(c)}: next visit due ${fmt(c.nextDue)}.`, () => {
      Object.assign(c, before, { updated: stamp() }); save(true); renderAll();
    });
  });

  // ---------- Google Sheet sync ----------
  // Every device sends all its records; the sheet keeps the newest copy of each (by `updated`)
  // and sends everything back.
  // The client list is only shown once this browser has connected with the right passcode.
  const syncUrl = () => CONFIG.sheetUrl || "";
  const syncOn = () => !!(syncUrl() && state.settings.syncKey);
  const unlocked = () => syncOn() && !!state.settings.verified;
  delete state.settings.syncUrl; // no longer typed in or shown on the page
  if (state.settings.lastSync && state.settings.syncKey) state.settings.verified = true; // connected before this check existed
  let syncTimer = null, syncing = false, syncAgain = false, syncError = "";

  function scheduleSync(delay) {
    if (!syncOn()) return;
    setSyncPill("pending");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, delay == null ? 2000 : delay);
  }
  function payload() {
    const clients = state.clients.map(c => Object.assign({}, c));
    Object.keys(state.removed).forEach(id => clients.push({ id, removed: true, updated: state.removed[id] }));
    return { key: state.settings.syncKey, clients };
  }
  function applyServer(res) {
    const local = new Map(state.clients.map(c => [c.id, c]));
    (res.clients || []).forEach(sc => {
      if (!sc || !sc.id) return;
      const lc = local.get(sc.id), su = sc.updated || "";
      if (sc.removed) {
        if (!lc || (lc.updated || "") <= su) { local.delete(sc.id); state.removed[sc.id] = su; }
        return;
      }
      const tomb = state.removed[sc.id];
      if (tomb && tomb >= su) return; // deleted here after the sheet's copy
      if (tomb) delete state.removed[sc.id];
      if (!lc || su >= (lc.updated || "")) {
        if (!sc.first && !sc.last) return;
        const rec = { id: sc.id, inactive: !!sc.inactive, updated: su };
        FIELDS.forEach(f => { rec[f] = String(sc[f] || ""); });
        // An older copy of the sheet script doesn't know about "on hold": keep this browser's.
        if ("onHold" in sc) { rec.onHold = !!sc.onHold; rec.holdSince = String(sc.holdSince || ""); }
        else if (lc) { rec.onHold = lc.onHold; rec.holdReason = lc.holdReason || ""; rec.holdSince = lc.holdSince || ""; }
        // Same for "ended care" / "deceased" (an older script only has Inactive).
        if ("endReason" in sc) { rec.endReason = sc.endReason === "deceased" ? "deceased" : sc.endReason ? "ended" : ""; rec.endedOn = String(sc.endedOn || ""); }
        else if (lc) { rec.endReason = lc.endReason || ""; rec.endedOn = lc.endedOn || ""; }
        if (rec.endReason) rec.inactive = true;
        if (!rec.inactive) { rec.endReason = ""; rec.endedOn = ""; }
        DATE_FIELDS.concat("holdSince", "endedOn").forEach(f => { const d = parseDate(rec[f]); rec[f] = d || ""; });
        if (!rec.nextDue && isDate(rec.lastVisit)) rec.nextDue = nextVisit(rec.lastVisit); // row typed into the sheet
        if (lc) Object.assign(lc, rec); else local.set(sc.id, rec);
      }
    });
    state.clients = [...local.values()];
  }
  async function syncNow(manual) {
    clearTimeout(syncTimer);
    if (!syncOn()) return;
    if (syncing) { syncAgain = true; return; }
    if (!navigator.onLine) { syncError = "offline"; setSyncPill("bad"); renderSyncCard(); return; }
    syncing = true; setSyncPill("syncing");
    try {
      const res = await fetch(syncUrl(), {
        method: "POST", redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // plain text avoids a CORS preflight Apps Script can't answer
        body: JSON.stringify(payload())
      });
      const j = await res.json();
      if (!j.ok) {
        if (j.error === "passcode") {
          // Wrong passcode, or it has been changed: lock the page. If this browser had been
          // connected before, also erase its copy of the list (the sheet keeps everything).
          if (state.settings.verified) { state.clients = []; state.removed = {}; delete state.settings.lastSync; }
          delete state.settings.syncKey; delete state.settings.verified; save(); renderAll(); applyLock();
          toast("That passcode isn't right. Please enter it again.");
        }
        syncError = j.error || "error";
        setSyncPill("bad"); return;
      }
      $("#weak-note").hidden = !j.weak;
      applyServer(j);
      const firstTime = !state.settings.verified;
      state.settings.verified = true;
      state.settings.lastSync = stamp(); syncError = "";
      save();
      if (manual) toast(firstTime ? "Connected. The client list is loaded." : "Synced with the Google Sheet.");
      if (!document.querySelector("dialog[open]")) renderAll();
      applyLock();
      setSyncPill("ok");
    } catch (e) {
      syncError = "network"; setSyncPill("bad");
      if (manual) toast("Couldn't reach the Google Sheet. Changes are saved here and will sync later.");
    } finally {
      syncing = false;
      renderSyncCard();
      if (syncAgain) { syncAgain = false; scheduleSync(500); }
    }
  }
  function setSyncPill(st) {
    const el = $("#sync-pill");
    if (!syncOn()) { el.hidden = true; return; }
    el.hidden = false;
    const map = { ok: ["✓ Synced", "ok"], pending: ["Saving…", ""], syncing: ["Syncing…", ""], bad: ["Not synced", "bad"] };
    const [txt, cls] = map[st] || map.ok;
    el.textContent = txt; el.className = "sync-pill " + cls;
  }
  // Locked: only the passcode box is shown. Unlocked: the lists, buttons and sync status.
  function applyLock() {
    const open = unlocked();
    $("#app-content").hidden = !open;
    $("#add-btn").hidden = !open;
    $("#sync-card").classList.toggle("data-card", open);
    $("#sync-title").textContent = open ? "Google Sheet" : "Enter passcode";
    if (!open) document.querySelectorAll("dialog[open]").forEach(d => d.close());
  }
  function renderSyncCard() {
    const on = syncOn(), open = unlocked();
    $("#sync-form").hidden = open;
    $("#sync-connected").hidden = !open;
    $("#sync-form button[type=submit]").disabled = on && !open; // checking the passcode
    let msg;
    if (!CONFIG.sheetUrl) msg = "This page isn't linked to its Google Sheet yet (sheetUrl in config.js).";
    else if (on && !open) msg = syncError === "network" || syncError === "offline" ? "Couldn't reach the Google Sheet. Check the internet connection and try again." : "Checking the passcode…";
    else if (!on) msg = syncError === "passcode" ? "Wrong passcode — try again." : "This page shows the supervisory visit list once you enter the team passcode.";
    else if (syncError === "network" || syncError === "offline") msg = "Couldn't reach the sheet. Changes are saved here and will sync when you're back online.";
    else if (syncError === "not set up") msg = "The sheet's script has no PASSCODE set yet. See the setup steps.";
    else if (syncError) msg = "The sheet reported a problem: " + syncError;
    else msg = state.settings.lastSync ? `Connected. Last synced ${new Date(state.settings.lastSync).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : "Connected.";
    $("#sync-status").textContent = msg;
    $("#sync-card").classList.toggle("warn-card", !open);
    applyLock();
  }
  $("#sync-form").addEventListener("submit", e => {
    e.preventDefault();
    const key = $("#sync-key").value.trim();
    if (!key || !CONFIG.sheetUrl) return;
    state.settings.syncKey = key; syncError = "";
    $("#sync-key").value = "";
    save(); renderSyncCard();
    syncNow(true);
  });
  $("#sync-now-btn").addEventListener("click", () => syncNow(true));
  $("#forget-btn").addEventListener("click", () => {
    if (!confirm("Disconnect this computer? The client list and the passcode are erased from this browser, and the passcode will be needed to see the list again. The Google Sheet keeps everything.")) return;
    clearTimeout(syncTimer);
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    location.reload();
  });
  $("#sync-pill").addEventListener("click", () => $("#sync-card").scrollIntoView({ behavior: "smooth" }));

  // ---------- Keep the lists current ----------
  // Opening or returning to the page re-checks the dates (and the sheet), and the lists roll
  // over by themselves at midnight if the page is left open.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (today() !== renderedDay && !document.querySelector("dialog[open]")) renderAll();
    const last = state.settings.lastSync ? Date.parse(state.settings.lastSync) : 0;
    if (syncOn() && Date.now() - last > 60000) syncNow();
  });
  setInterval(() => { if (today() !== renderedDay && !document.querySelector("dialog[open]")) renderAll(); }, 60000);
  window.addEventListener("online", () => syncOn() && syncNow());

  renderAll();
  renderSyncCard(); setSyncPill("ok");
  if (syncOn()) syncNow();
})();
