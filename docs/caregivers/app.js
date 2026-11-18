/* Caregiver compliance: driver's license and car insurance expirations, and annual training.
 * Saved in this browser (localStorage) and, when connected, in a private Google Sheet.
 * No server, no build step. All dates are "YYYY-MM-DD" strings. */
(function () {
  "use strict";

  const CONFIG = Object.assign({ expiringDays: 10, trainingDays: 30, trainingMonths: 11, sheetUrl: "", message: "" }, window.CAREGIVERS_CONFIG || {});
  const STORE_KEY = "rah-caregivers-v1";
  const FIELDS = ["first", "last", "hireDate", "licenseExp", "insuranceExp", "trainingDue", "lastTraining", "notes"];

  // ---------- Storage ----------
  function loadState() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* ignore */ }
    if (!s || typeof s !== "object") s = {};
    s.caregivers = Array.isArray(s.caregivers) ? s.caregivers : [];
    s.removed = s.removed && typeof s.removed === "object" ? s.removed : {}; // id -> when deleted
    s.settings = Object.assign({ sort: "name", dir: 1, showInactive: false }, s.settings || {});
    return s;
  }
  let state = loadState();
  function save(changed) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast("Couldn't save — your browser storage may be full or turned off."); }
    if (changed) scheduleSync();
  }
  const stamp = () => new Date().toISOString();
  const uid = () => "c-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- Dates ----------
  const pad = n => String(n).padStart(2, "0");
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  function today() { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
  const ms = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const fromMs = t => { const d = new Date(t); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
  const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / 864e5); // b - a
  const weekday = s => new Date(ms(s)).getUTCDay(); // 0 Sun … 6 Sat

  // Same as Excel's EDATE: 31 Jan + 1 month = 28/29 Feb.
  function addMonths(s, n) {
    const [y, m, d] = s.split("-").map(Number);
    const total = (y * 12 + (m - 1)) + n;
    const ny = Math.floor(total / 12), nm = total % 12 + 1;
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    return iso(ny, nm, Math.min(d, last));
  }
  // Closest weekday: Saturday → Friday before, Sunday → Monday after.
  function closestWeekday(s) {
    const w = weekday(s);
    return w === 6 ? fromMs(ms(s) - 864e5) : w === 0 ? fromMs(ms(s) + 864e5) : s;
  }
  // First due date from the hire date, and each next one from the last due date.
  const nextTraining = s => (isDate(s) ? closestWeekday(addMonths(s, CONFIG.trainingMonths)) : "");

  function fmt(s) { if (!isDate(s)) return ""; const [y, m, d] = s.split("-"); return `${m}/${d}/${y}`; }
  function fmtLong(s) {
    if (!isDate(s)) return "";
    return new Date(ms(s)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  function relative(s) {
    const n = daysBetween(today(), s);
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    if (n === -1) return "yesterday";
    return n > 0 ? `in ${n} days` : `${-n} days ago`;
  }
  // Typed or synced dates: 2026-11-17, 11/17/2026, 11/17/26, 11-17-2026.
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
  const byId = id => state.caregivers.find(c => c.id === id);
  const active = () => state.caregivers.filter(c => !c.inactive);
  const cmpName = (a, b) => (a.last || "").localeCompare(b.last || "") || (a.first || "").localeCompare(b.first || "");

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
  const ITEMS = [
    { key: "insuranceExp", label: "Car insurance", word: "car insurance" },
    { key: "licenseExp", label: "Driver's license", word: "driver's license" }
  ];

  function expiringRows(it) {
    const t = today(), rows = [];
    active().forEach(c => {
      const d = c[it.key];
      if (isDate(d) && daysBetween(t, d) <= CONFIG.expiringDays) rows.push({ c, it, date: d, days: daysBetween(t, d) });
    });
    return rows.sort((a, b) => a.days - b.days || cmpName(a.c, b.c));
  }
  function trainingRows() {
    const t = today();
    return active().filter(c => isDate(c.trainingDue) && daysBetween(t, c.trainingDue) <= CONFIG.trainingDays)
      .map(c => ({ c, days: daysBetween(t, c.trainingDue) }))
      .sort((a, b) => a.days - b.days || cmpName(a.c, b.c));
  }
  function missingRows() {
    return active().map(c => ({ c, miss: [!isDate(c.hireDate) && "hire date", !isDate(c.licenseExp) && "license", !isDate(c.insuranceExp) && "insurance"].filter(Boolean) }))
      .filter(r => r.miss.length).sort((a, b) => cmpName(a.c, b.c));
  }

  function status(days) {
    if (days < 0) return { cls: "late", text: days === -1 ? "Expired yesterday" : `Expired ${-days} days ago` };
    if (days === 0) return { cls: "late", text: "Expires today" };
    return { cls: days <= 3 ? "soon" : "", text: days === 1 ? "Expires tomorrow" : `Expires in ${days} days` };
  }

  function renderDocs() {
    const by = fmt(fromMs(ms(today()) + CONFIG.expiringDays * 864e5));
    ITEMS.forEach(it => {
      const rows = expiringRows(it), k = it.key;
      $(`#${k}-count`).textContent = rows.length;
      $(`#${k}-count`).parentElement.classList.toggle("hot", rows.length > 0);
      $(`#${k}-sub`).textContent = `Expired, or expiring in the next ${CONFIG.expiringDays} days (by ${by}).`;
      $(`#${k}-list`).innerHTML = rows.length ? rows.map(r => {
        const st = status(r.days);
        return `<div class="row">
          <div class="row-main">
            <button type="button" class="row-name" data-edit="${esc(r.c.id)}">${esc(fullName(r.c))}</button>
            <span class="row-what">${r.days < 0 ? "Expired" : "Expires"} ${fmtLong(r.date)}</span>
            <span class="row-status ${st.cls}">${st.text}</span>
          </div>
          <div class="row-btns">
            <button type="button" class="btn small" data-renew="${esc(r.c.id)}" data-item="${k}">Enter new expiration date</button>
            <button type="button" class="btn small ghost" data-copy="${esc(r.c.id)}" data-item="${k}">Copy message</button>
            <button type="button" class="btn small ghost grey" data-inactive="${esc(r.c.id)}">Make inactive</button>
          </div>
        </div>`;
      }).join("") : `<p class="all-clear">✓ No ${it.word} expired or expiring in the next ${CONFIG.expiringDays} days.</p>`;
    });
  }

  function renderTraining() {
    const rows = trainingRows();
    $("#training-count").textContent = rows.length;
    $("#training-count").parentElement.classList.toggle("hot", rows.length > 0);
    $("#training-sub").textContent = `Overdue, or due in the next ${CONFIG.trainingDays} days. Due ${CONFIG.trainingMonths} months after the hire date, then every ${CONFIG.trainingMonths} months after the last due date.`;
    $("#training-list").innerHTML = rows.length ? rows.map(r => {
      const st = r.days < 0 ? { cls: "late", text: `Overdue by ${-r.days} day${r.days === -1 ? "" : "s"}` }
        : r.days === 0 ? { cls: "late", text: "Due today" } : { cls: r.days <= 7 ? "soon" : "", text: `Due ${relative(r.c.trainingDue)}` };
      return `<div class="row">
        <div class="row-main">
          <button type="button" class="row-name" data-edit="${esc(r.c.id)}">${esc(fullName(r.c))}</button>
          <span class="row-what">Due ${fmtLong(r.c.trainingDue)}${isDate(r.c.hireDate) ? ` · hired ${fmt(r.c.hireDate)}` : ""}${isDate(r.c.lastTraining) ? ` · last done ${fmt(r.c.lastTraining)}` : ""}</span>
          <span class="row-status ${st.cls}">${st.text}</span>
        </div>
        <div class="row-btns">
          <button type="button" class="btn small" data-done="${esc(r.c.id)}">Mark completed</button>
          <button type="button" class="btn small ghost grey" data-inactive="${esc(r.c.id)}">Make inactive</button>
        </div>
      </div>`;
    }).join("") : `<p class="all-clear">✓ Nobody is due for annual training in the next ${CONFIG.trainingDays} days.</p>`;
  }

  function renderMissing() {
    const rows = missingRows();
    $("#missing-count").textContent = rows.length;
    $("#missing-sum").textContent = `(${rows.length}) — click to show`;
    $("#missing-card").hidden = !rows.length;
    $("#missing-count").parentElement.hidden = !rows.length;
    $("#missing-list").innerHTML = rows.map(r => `<div class="row compact">
      <div class="row-main"><button type="button" class="row-name" data-edit="${esc(r.c.id)}" data-focus="${r.miss[0] === "hire date" ? "hireDate" : r.miss[0] === "license" ? "licenseExp" : "insuranceExp"}">${esc(fullName(r.c))}</button>
      <span class="row-what">No ${r.miss.join(", ")}</span></div>
      <div class="row-btns"><button type="button" class="btn small ghost" data-edit="${esc(r.c.id)}">Add dates</button></div>
    </div>`).join("");
  }

  function cellDate(s, warnDays) {
    if (!isDate(s)) return `<td class="none">—</td>`;
    const n = daysBetween(today(), s);
    const cls = warnDays == null ? "" : n < 0 ? "late" : n <= warnDays ? "soon" : "";
    return `<td class="${cls}">${fmt(s)}</td>`;
  }
  function renderRoster() {
    const q = nameKey($("#search").value, "");
    const list = state.caregivers.filter(c => (state.settings.showInactive || !c.inactive) && (!q || nameKey(c.first, c.last).includes(q)));
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
    const n = active().length;
    $("#all-count").textContent = `${n} active`;
    $("#roster").innerHTML = list.map(c => `<tr data-edit="${esc(c.id)}" class="${c.inactive ? "inactive" : ""}" tabindex="0">
      <td class="name">${esc(fullName(c))}${c.inactive ? ' <span class="tag">inactive</span>' : ""}</td>
      ${cellDate(c.hireDate)}${cellDate(c.insuranceExp, CONFIG.expiringDays)}${cellDate(c.licenseExp, CONFIG.expiringDays)}${cellDate(c.trainingDue, CONFIG.trainingDays)}${cellDate(c.lastTraining)}
      <td class="act-col">${c.inactive
        ? `<button type="button" class="btn small ghost" data-active="${esc(c.id)}">Make active</button>`
        : `<button type="button" class="btn small ghost grey" data-inactive="${esc(c.id)}">Make inactive</button>`}</td>
    </tr>`).join("");
    $("#roster-empty").hidden = state.caregivers.length > 0;
  }

  let renderedDay = "";
  function renderAll() {
    renderedDay = today();
    $("#today").textContent = "Today: " + fmtLong(renderedDay);
    renderDocs(); renderTraining(); renderMissing(); renderRoster();
  }

  // ---------- Clicks ----------
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-edit],[data-done],[data-renew],[data-copy],[data-inactive],[data-active],[data-sort],[data-close]");
    if (!t) return;
    if (t.dataset.close !== undefined) { t.closest("dialog").close(); return; }
    if (t.dataset.sort) {
      if (state.settings.sort === t.dataset.sort) state.settings.dir *= -1; else { state.settings.sort = t.dataset.sort; state.settings.dir = 1; }
      save(); renderRoster(); return;
    }
    if (t.dataset.done) { openDone(t.dataset.done); return; }
    if (t.dataset.inactive) { setInactive(t.dataset.inactive, true); return; }
    if (t.dataset.active) { setInactive(t.dataset.active, false); return; }
    if (t.dataset.renew) { openRenew(t.dataset.renew, t.dataset.item); return; }
    if (t.dataset.copy) { copyMessage(t.dataset.copy, t.dataset.item); return; }
    if (t.dataset.edit) openEdit(t.dataset.edit, t.dataset.focus);
  });
  $("#roster").addEventListener("keydown", e => {
    const tr = e.target.closest("tr[data-edit]");
    if (tr && e.target === tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openEdit(tr.dataset.edit); }
  });
  $("#search").addEventListener("input", renderRoster);
  $("#show-inactive").checked = !!state.settings.showInactive;
  $("#show-inactive").addEventListener("change", e => { state.settings.showInactive = e.target.checked; save(); renderRoster(); });
  $("#add-btn").addEventListener("click", () => openEdit(null));
  document.querySelector('a[href="#missing-card"]').addEventListener("click", () => { $("#missing-card details").open = true; });

  async function copyMessage(id, key) {
    const c = byId(id), it = ITEMS.find(i => i.key === key);
    if (!c || !it) return;
    const d = c[key], expired = daysBetween(today(), d) < 0;
    const text = CONFIG.message.replace(/\{first\}/g, c.first || "").replace(/\{item\}/g, it.word)
      .replace(/\{date\}/g, fmt(d).slice(0, 5)).replace(/\{when\}/g, expired ? "expired on" : "is expiring soon on");
    try { await navigator.clipboard.writeText(text); toast("Message copied — paste it into a text or email."); }
    catch (err) { window.prompt("Copy this message:", text); }
  }

  // ---------- Add / edit ----------
  const ed = $("#edit-dialog"), edForm = $("#edit-form");
  let editingId = null, hireAtOpen = "";
  function openEdit(id, focus) {
    const c = id ? byId(id) : null;
    editingId = c ? c.id : null;
    edForm.reset();
    $("#ed-title").textContent = c ? fullName(c) : "Add caregiver";
    $("#ed-delete").hidden = !c;
    $("#ed-inactive").hidden = !c || !!c.inactive;
    FIELDS.forEach(f => { edForm.elements[f].value = c ? (c[f] || "") : ""; });
    $("#ed-training-fields").hidden = !c;
    edForm.elements.hireDate.required = !c;
    $("#ed-inactive-wrap").hidden = !c; // new caregivers: worked out from the hire date
    edForm.elements.inactive.checked = !!(c && c.inactive);
    hireAtOpen = c ? c.hireDate || "" : "";
    dueHint();
    ed.showModal();
    const el = edForm.elements[focus || (c ? "" : "first")];
    if (el) { el.focus(); if (el.select) try { el.select(); } catch (e) { /* date inputs */ } }
  }
  // While the training due date is still the one worked out from the hire date (or blank),
  // changing the hire date moves it too.
  let lastHire = "";
  edForm.elements.hireDate.addEventListener("focus", () => { lastHire = edForm.elements.hireDate.value; });
  edForm.elements.hireDate.addEventListener("change", () => {
    const due = edForm.elements.trainingDue, hire = edForm.elements.hireDate.value;
    const auto = !due.value || due.value === nextTraining(lastHire) || due.value === nextTraining(hireAtOpen);
    if (auto && !edForm.elements.lastTraining.value) due.value = nextTraining(hire);
    lastHire = hire;
    dueHint();
  });
  edForm.elements.trainingDue.addEventListener("change", dueHint);
  function dueHint() {
    const hire = edForm.elements.hireDate.value, due = edForm.elements.trainingDue.value;
    let msg = "";
    if (!editingId) msg = isDate(hire) ? `Annual training will be due ${fmtLong(nextTraining(hire))} (${CONFIG.trainingMonths} months after the hire date, on a weekday).` : `Annual training due date is worked out from the hire date.`;
    else if (isDate(hire) && !isDate(due)) msg = `First training would be due ${fmtLong(nextTraining(hire))}.`;
    else if (isDate(due) && weekday(due) % 6 === 0) msg = "Note: this due date is on a weekend.";
    else if (isDate(hire) && due === nextTraining(hire)) msg = `${CONFIG.trainingMonths} months after the hire date, moved to the closest weekday.`;
    $("#ed-due-hint").textContent = msg;
  }

  edForm.addEventListener("submit", e => {
    e.preventDefault();
    const v = {};
    FIELDS.forEach(f => { v[f] = edForm.elements[f].value.trim(); });
    if (!v.first || !v.last) return;
    if (!editingId) { v.trainingDue = nextTraining(v.hireDate); v.lastTraining = ""; }
    else if (!v.trainingDue && isDate(v.hireDate) && !v.lastTraining) v.trainingDue = nextTraining(v.hireDate);
    v.inactive = edForm.elements.inactive.checked;
    const dup = state.caregivers.find(c => c.id !== editingId && nameKey(c.first, c.last) === nameKey(v.first, v.last));
    if (dup && !confirm(`${fullName(dup)} is already on the list. Save anyway?`)) return;
    if (editingId) {
      Object.assign(byId(editingId), v, { updated: stamp() });
      toast(`Saved ${v.first} ${v.last}.`);
    } else {
      state.caregivers.push(Object.assign({ id: uid() }, v, { updated: stamp() }));
      toast(`Added ${v.first} ${v.last}.` + (v.trainingDue ? ` Training due ${fmt(v.trainingDue)}.` : ""));
    }
    save(true); ed.close(); renderAll();
  });

  $("#ed-delete").addEventListener("click", () => {
    const c = byId(editingId);
    if (!c) return;
    if (!confirm(`Delete ${fullName(c)}? To keep their record but hide them, tick "Inactive" instead.`)) return;
    state.caregivers = state.caregivers.filter(x => x.id !== c.id);
    state.removed[c.id] = stamp();
    save(true); ed.close(); renderAll();
    toast(`Deleted ${fullName(c)}.`, () => {
      delete state.removed[c.id];
      c.updated = stamp(); state.caregivers.push(c);
      save(true); renderAll();
    });
  });

  // ---------- Active / inactive ----------
  function setInactive(id, inactive) {
    const c = byId(id);
    if (!c || !!c.inactive === inactive) return;
    c.inactive = inactive; c.updated = stamp();
    save(true); renderAll();
    toast(inactive ? `${fullName(c)} is now inactive and off the lists.` : `${fullName(c)} is active again.`, () => {
      c.inactive = !inactive; c.updated = stamp(); save(true); renderAll();
    });
  }
  $("#ed-inactive").addEventListener("click", () => { const id = editingId; ed.close(); setInactive(id, true); });

  // ---------- New license / insurance date ----------
  const rd = $("#renew-dialog"), rdForm = $("#renew-form");
  let renewId = null, renewKey = null;
  function openRenew(id, key) {
    const c = byId(id), it = ITEMS.find(i => i.key === key);
    if (!c || !it) return;
    renewId = id; renewKey = key;
    $("#rd-title").textContent = fullName(c);
    const d = c[key];
    $("#rd-info").textContent = `${it.label} ${daysBetween(today(), d) < 0 ? "expired" : "expires"} ${fmtLong(d)}.`;
    $("#rd-label").textContent = `New ${it.word} expiration date`;
    rdForm.elements.date.value = "";
    rd.showModal();
    rdForm.elements.date.focus();
  }
  rdForm.addEventListener("submit", e => {
    e.preventDefault();
    const c = byId(renewId), it = ITEMS.find(i => i.key === renewKey), d = rdForm.elements.date.value;
    if (!c || !it || !isDate(d)) return;
    if (daysBetween(today(), d) < 0 && !confirm(`${fmt(d)} is in the past. Save it anyway?`)) return;
    const before = c[it.key];
    c[it.key] = d; c.updated = stamp();
    save(true); rd.close(); renderAll();
    toast(`${fullName(c)}: ${it.word} now expires ${fmt(d)}.`, () => {
      c[it.key] = before; c.updated = stamp(); save(true); renderAll();
    });
  });

  // ---------- Training completed ----------
  const dd = $("#done-dialog"), ddForm = $("#done-form");
  let doneId = null;
  function openDone(id) {
    const c = byId(id);
    if (!c) return;
    doneId = id;
    $("#dd-title").textContent = fullName(c);
    $("#dd-info").textContent = `Annual training was due ${fmtLong(c.trainingDue)}.`;
    ddForm.elements.completed.value = today();
    $("#dd-next").innerHTML = `Next training will be due <b>${esc(fmtLong(nextTraining(c.trainingDue)))}</b> (${CONFIG.trainingMonths} months after this due date).`;
    dd.showModal();
  }
  ddForm.addEventListener("submit", e => {
    e.preventDefault();
    const c = byId(doneId), when = ddForm.elements.completed.value;
    if (!c || !isDate(when)) return;
    const before = { trainingDue: c.trainingDue, lastTraining: c.lastTraining };
    c.lastTraining = when;
    c.trainingDue = nextTraining(c.trainingDue);
    c.updated = stamp();
    save(true); dd.close(); renderAll();
    toast(`${fullName(c)}: next training due ${fmt(c.trainingDue)}.`, () => {
      Object.assign(c, before, { updated: stamp() }); save(true); renderAll();
    });
  });

  const DATE_FIELDS = ["hireDate", "licenseExp", "insuranceExp", "trainingDue", "lastTraining"];

  // ---------- Google Sheet sync ----------
  // Every device sends all its records; the sheet keeps the newest copy of each (by `updated`)
  // and sends everything back.
  const syncUrl = () => CONFIG.sheetUrl || state.settings.syncUrl || "";
  const syncOn = () => !!(syncUrl() && state.settings.syncKey);
  let syncTimer = null, syncing = false, syncAgain = false, syncError = "";

  function scheduleSync(delay) {
    if (!syncOn()) return;
    setSyncPill("pending");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, delay == null ? 2000 : delay);
  }
  function payload() {
    const caregivers = state.caregivers.map(c => Object.assign({}, c));
    Object.keys(state.removed).forEach(id => caregivers.push({ id, removed: true, updated: state.removed[id] }));
    return { key: state.settings.syncKey, caregivers };
  }
  function applyServer(res) {
    const local = new Map(state.caregivers.map(c => [c.id, c]));
    (res.caregivers || []).forEach(sc => {
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
        DATE_FIELDS.forEach(f => { const d = parseDate(rec[f]); rec[f] = d || ""; });
        if (lc) Object.assign(lc, rec); else local.set(sc.id, rec);
      }
    });
    state.caregivers = [...local.values()];
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
        if (j.error === "passcode") { delete state.settings.syncKey; save(); toast("The Google Sheet passcode is wrong. Enter it again at the bottom of the page."); }
        syncError = j.error || "error";
        setSyncPill("bad"); return;
      }
      $("#weak-note").hidden = !j.weak;
      applyServer(j);
      state.settings.lastSync = stamp(); syncError = "";
      save();
      if (manual) toast("Synced with the Google Sheet.");
      if (!document.querySelector("dialog[open]")) renderAll();
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
  function renderSyncCard() {
    const on = syncOn();
    $("#sync-form").hidden = on;
    $("#sync-connected").hidden = !on;
    $("#sync-url-wrap").hidden = !!CONFIG.sheetUrl;
    let msg;
    if (!on) msg = syncError === "passcode" ? "Wrong passcode — try again." : "Not connected. The caregiver list is only saved in this browser.";
    else if (syncError === "network" || syncError === "offline") msg = "Couldn't reach the sheet. Changes are saved here and will sync when you're back online.";
    else if (syncError === "locked") msg = "The sheet's script is an old version. Update it (see the setup steps) and click Sync now.";
    else if (syncError === "not set up") msg = "The sheet's script has no PASSCODE set yet. See the setup steps.";
    else if (syncError) msg = "The sheet reported a problem: " + syncError;
    else msg = state.settings.lastSync ? `Connected. Last synced ${new Date(state.settings.lastSync).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : "Connected.";
    $("#sync-status").textContent = msg;
    $("#sync-card").classList.toggle("warn-card", !on);
  }
  $("#sync-form").addEventListener("submit", e => {
    e.preventDefault();
    const key = $("#sync-key").value.trim(), url = $("#sync-url").value.trim();
    if (!CONFIG.sheetUrl) {
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) { toast("That doesn't look like an Apps Script web app URL (it ends in /exec)."); return; }
      state.settings.syncUrl = url;
    }
    if (!key) return;
    state.settings.syncKey = key; syncError = "";
    $("#sync-key").value = "";
    save(); renderSyncCard();
    syncNow(true);
  });
  $("#sync-now-btn").addEventListener("click", () => syncNow(true));
  $("#sync-off-btn").addEventListener("click", () => {
    if (!confirm("Stop syncing this computer? The list stays saved in this browser and in the sheet.")) return;
    delete state.settings.syncKey; save(); setSyncPill(); renderSyncCard();
  });
  $("#sync-pill").addEventListener("click", () => $("#sync-card").scrollIntoView({ behavior: "smooth" }));
  $("#sync-url").value = state.settings.syncUrl || "";

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
