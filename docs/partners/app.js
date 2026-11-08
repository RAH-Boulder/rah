/* Referral partner CRM: check-ins, visit notes, follow-ups and driving routes.
 * Everything is saved in this browser (localStorage). No server, no build step. */
(function () {
  "use strict";

  const STORE_KEY = "rah-partners-v1";
  const GEO_KEY = "rah-partners-geo-v1";
  const MAX_WAYPOINTS = 9; // Google Maps links allow up to 9 stops between start and end.

  // ---------- Storage ----------
  function loadState() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* ignore */ }
    if (!s || typeof s !== "object") s = {};
    s.partners = Array.isArray(s.partners) ? s.partners : [];
    s.visits = Array.isArray(s.visits) ? s.visits : [];
    s.notes = s.notes && typeof s.notes === "object" ? s.notes : {};
    s.removed = Array.isArray(s.removed) ? s.removed : [];
    s.route = Array.isArray(s.route) ? s.route : [];
    s.deletedVisits = s.deletedVisits && typeof s.deletedVisits === "object" ? s.deletedVisits : {}; // id -> when deleted
    s.removedAt = s.removedAt && typeof s.removedAt === "object" ? s.removedAt : {}; // partner id -> when removed
    s.settings = Object.assign({ tab: "partners", sort: "city", city: "", startMode: "here", startAddress: "", endMode: "anywhere" }, s.settings || {});
    // Add any partners from partners.js that aren't saved yet (and weren't removed).
    const have = new Set(s.partners.map(p => p.id));
    (window.PARTNERS || []).forEach(p => {
      if (!have.has(p.id) && !s.removed.includes(p.id)) s.partners.push(Object.assign({}, p));
    });
    return s;
  }
  let state = loadState();
  // save(true) = your data changed, so send it to the Google Sheet soon.
  function save(changed) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast("Couldn't save — your browser storage may be full or turned off."); }
    if (changed) scheduleSync();
  }
  const stamp = () => new Date().toISOString();
  let geoCache = {};
  try { geoCache = JSON.parse(localStorage.getItem(GEO_KEY)) || {}; } catch (e) { geoCache = {}; }
  function saveGeo() { try { localStorage.setItem(GEO_KEY, JSON.stringify(geoCache)); } catch (e) { /* ignore */ } }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- Helpers ----------
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const byId = id => state.partners.find(p => p.id === id);
  const fullAddress = p => `${p.address}, ${p.city}, ${p.state} ${p.zip || ""}`.trim();
  const pad = n => String(n).padStart(2, "0");
  function localDateTime(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function today() { return localDateTime(new Date()).slice(0, 10); }
  function parseLocal(s) { // "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" as local time
    const [d, t] = String(s).split("T");
    const [y, m, day] = d.split("-").map(Number);
    const [hh, mm] = (t || "00:00").split(":").map(Number);
    return new Date(y, m - 1, day, hh || 0, mm || 0);
  }
  function daysAgo(s) {
    const a = parseLocal(String(s).slice(0, 10)), b = parseLocal(today());
    return Math.round((b - a) / 86400000);
  }
  function relDay(s) {
    const n = daysAgo(s);
    if (n === 0) return "today";
    if (n === 1) return "yesterday";
    if (n === -1) return "tomorrow";
    if (n < 0) return `in ${-n} days`;
    if (n < 60) return `${n} days ago`;
    const months = Math.round(n / 30);
    return months < 24 ? `${months} months ago` : `${Math.round(n / 365)} years ago`;
  }
  function fmtDate(s, withTime) {
    const d = parseLocal(s);
    const opts = { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" };
    let out = d.toLocaleDateString(undefined, opts);
    if (withTime && String(s).includes("T")) out += ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return out;
  }
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
  }
  function visitsFor(id) {
    return state.visits.filter(v => v.partnerId === id).sort((a, b) => b.when.localeCompare(a.when));
  }
  function lastVisit(id) {
    let last = null;
    for (const v of state.visits) if (v.partnerId === id && (!last || v.when > last.when)) last = v;
    return last;
  }
  function cities() {
    return [...new Set(state.partners.map(p => p.city))].sort((a, b) => a.localeCompare(b));
  }
  function cityOptions(selected) {
    const counts = {};
    state.partners.forEach(p => { counts[p.city] = (counts[p.city] || 0) + 1; });
    return `<option value="">All cities (${state.partners.length})</option>` +
      cities().map(c => `<option value="${esc(c)}"${c === selected ? " selected" : ""}>${esc(c)} (${counts[c]})</option>`).join("");
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Tabs ----------
  function showTab(tab) {
    state.settings.tab = tab; save();
    document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    document.querySelectorAll(".tab-panel").forEach(s => { s.hidden = s.id !== "tab-" + tab; });
    if (tab === "partners") renderPartners();
    if (tab === "route") renderRoute();
    if (tab === "visits") renderVisits();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));

  function renderBadges() {
    const rc = $("#route-count");
    rc.textContent = state.route.length; rc.hidden = !state.route.length;
    const due = state.visits.filter(v => v.followUp && !v.followUpDone && v.followUp <= today()).length;
    const dc = $("#due-count");
    dc.textContent = due; dc.hidden = !due;
  }

  // ---------- Partners list ----------
  const searchEl = $("#search"), cityEl = $("#city-filter"), sortEl = $("#sort");
  sortEl.value = state.settings.sort;

  function filteredPartners() {
    const q = searchEl.value.trim().toLowerCase();
    const city = state.settings.city;
    let list = state.partners.filter(p => {
      if (city && p.city !== city) return false;
      if (!q) return true;
      return (p.name + " " + p.address + " " + p.city + " " + (state.notes[p.id] || "")).toLowerCase().includes(q);
    });
    const lv = {};
    list.forEach(p => { const v = lastVisit(p.id); lv[p.id] = v ? v.when : ""; });
    const byName = (a, b) => a.name.localeCompare(b.name);
    const sort = state.settings.sort;
    if (sort === "name") list.sort(byName);
    else if (sort === "city") list.sort((a, b) => a.city.localeCompare(b.city) || byName(a, b));
    else if (sort === "stale") list.sort((a, b) => lv[a.id].localeCompare(lv[b.id]) || byName(a, b));
    else if (sort === "recent") list.sort((a, b) => lv[b.id].localeCompare(lv[a.id]) || byName(a, b));
    return list;
  }

  function partnerRow(p) {
    const v = lastVisit(p.id);
    const count = state.visits.filter(x => x.partnerId === p.id).length;
    let meta, cls;
    if (!v) { meta = "Not visited yet"; cls = "never"; }
    else {
      meta = `Last visit ${relDay(v.when)} · ${count} visit${count === 1 ? "" : "s"}`;
      cls = daysAgo(v.when) <= 14 ? "recent" : "";
    }
    const inRoute = state.route.includes(p.id);
    return `<div class="partner">
      <button type="button" class="partner-main" data-open="${esc(p.id)}">
        <span class="partner-name">${esc(p.name)}</span>
        <span class="partner-addr">${esc(fullAddress(p))}</span>
        <span class="partner-meta ${cls}">${esc(meta)}</span>
      </button>
      <div class="partner-btns">
        <button type="button" class="btn small" data-checkin="${esc(p.id)}">Check in</button>
        <button type="button" class="btn small ghost${inRoute ? " on" : ""}" data-route="${esc(p.id)}" aria-pressed="${inRoute}">${inRoute ? "✓ In route" : "+ Route"}</button>
      </div>
    </div>`;
  }

  function renderPartners() {
    cityEl.innerHTML = cityOptions(state.settings.city);
    if (state.settings.city && !cities().includes(state.settings.city)) { state.settings.city = ""; cityEl.value = ""; }
    $("#city-options").innerHTML = cities().map(c => `<option value="${esc(c)}">`).join("");
    const list = filteredPartners();
    const box = $("#partner-list");
    $("#result-count").textContent = `${list.length} partner${list.length === 1 ? "" : "s"}`;
    $("#add-shown-btn").hidden = !list.length;
    if (!list.length) {
      box.innerHTML = `<p class="empty">No partners match. <button type="button" class="link" id="empty-add">Add a new partner</button></p>`;
      $("#empty-add").onclick = () => openEdit(null, searchEl.value.trim());
    } else if (state.settings.sort === "city" && !state.settings.city) {
      let html = "", cur = null;
      list.forEach(p => {
        if (p.city !== cur) { cur = p.city; html += `<h2 class="city-head">${esc(cur)}</h2>`; }
        html += partnerRow(p);
      });
      box.innerHTML = html;
    } else {
      box.innerHTML = list.map(partnerRow).join("");
    }
    renderBadges();
  }

  searchEl.addEventListener("input", renderPartners);
  cityEl.addEventListener("change", () => { state.settings.city = cityEl.value; save(); renderPartners(); });
  sortEl.addEventListener("change", () => { state.settings.sort = sortEl.value; save(); renderPartners(); });
  $("#add-shown-btn").addEventListener("click", () => {
    const list = filteredPartners();
    let added = 0;
    list.forEach(p => { if (!state.route.includes(p.id)) { state.route.push(p.id); added++; } });
    routeResult = null; save(); renderPartners();
    toast(added ? `Added ${added} stop${added === 1 ? "" : "s"} to your route.` : "They're all in your route already.");
  });

  function toggleRoute(id) {
    const i = state.route.indexOf(id);
    if (i >= 0) state.route.splice(i, 1); else state.route.push(id);
    routeResult = null; save();
    return i < 0;
  }

  document.addEventListener("click", e => {
    const t = e.target.closest("[data-open],[data-checkin],[data-route],[data-visit],[data-fu-done],[data-remove-stop]");
    if (!t) return;
    if (t.dataset.open) openPartner(t.dataset.open);
    else if (t.dataset.checkin) openVisit(t.dataset.checkin, null);
    else if (t.dataset.visit) { const v = state.visits.find(x => x.id === t.dataset.visit); if (v) openVisit(v.partnerId, v); }
    else if (t.dataset.fuDone) {
      const v = state.visits.find(x => x.id === t.dataset.fuDone);
      if (v) { v.followUpDone = true; v.updated = stamp(); save(true); renderVisits(); toast("Follow-up marked done."); }
    } else if (t.dataset.removeStop) {
      toggleRoute(t.dataset.removeStop); renderRoute(); renderBadges();
    } else if (t.dataset.route) {
      const added = toggleRoute(t.dataset.route);
      toast(added ? "Added to route." : "Removed from route.");
      refreshAll();
    }
  });

  // ---------- Dialogs ----------
  document.querySelectorAll("dialog").forEach(d => {
    d.addEventListener("click", e => {
      if (e.target.closest("[data-close]")) d.close();
      else if (e.target === d) d.close(); // tap outside
    });
  });

  // Partner detail
  const pd = $("#partner-dialog");
  let currentPartner = null;
  function openPartner(id) {
    const p = byId(id); if (!p) return;
    currentPartner = id;
    $("#pd-name").textContent = p.name;
    $("#pd-address").textContent = fullAddress(p);
    $("#pd-directions").href = "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent(fullAddress(p));
    $("#pd-notes").value = state.notes[id] || "";
    renderPartnerDetail();
    if (!pd.open) pd.showModal();
  }
  function renderPartnerDetail() {
    if (!currentPartner) return;
    const inRoute = state.route.includes(currentPartner);
    const rb = $("#pd-route");
    rb.textContent = inRoute ? "✓ In route" : "+ Add to route";
    rb.classList.toggle("on", inRoute);
    const vs = visitsFor(currentPartner);
    $("#pd-visits").innerHTML = vs.length ? vs.map(v => visitCard(v, false)).join("") : `<p class="muted small">No visits yet. Tap <b>Check in</b> when you're there.</p>`;
  }
  $("#pd-checkin").addEventListener("click", () => openVisit(currentPartner, null));
  $("#pd-route").addEventListener("click", () => {
    const added = toggleRoute(currentPartner);
    toast(added ? "Added to route." : "Removed from route.");
    renderPartnerDetail(); refreshAll();
  });
  $("#pd-notes").addEventListener("input", e => {
    const val = e.target.value;
    if (val.trim()) state.notes[currentPartner] = val; else delete state.notes[currentPartner];
    const p = byId(currentPartner); if (p) p.updated = stamp();
    save(true);
  });
  $("#pd-edit").addEventListener("click", () => openEdit(currentPartner));
  pd.addEventListener("close", () => { currentPartner = null; refreshAll(); });

  // Visit card (used in partner detail and visit log)
  function visitCard(v, showPartner) {
    const p = byId(v.partnerId);
    const name = p ? p.name : (v.partnerName || "Removed partner");
    let fu = "";
    if (v.followUp || v.followUpNote) {
      const when = v.followUp ? `${fmtDate(v.followUp)} (${relDay(v.followUp)})` : "";
      fu = `<p class="visit-fu${v.followUpDone ? " done" : ""}">Follow up${when ? " " + esc(when) : ""}${v.followUpNote ? ": " + esc(v.followUpNote) : ""}</p>`;
    }
    return `<div class="visit">
      <div class="visit-head">
        ${showPartner ? `<button type="button" class="visit-title" data-open="${esc(v.partnerId)}">${esc(name)}</button>` : ""}
        <span class="visit-date">${esc(fmtDate(v.when, true))}</span>
      </div>
      <span class="visit-type">${esc(v.type || "Visit")}</span>
      ${v.contact ? `<p class="visit-contact">Saw: ${esc(v.contact)}</p>` : ""}
      ${v.notes ? `<p class="visit-notes">${esc(v.notes)}</p>` : ""}
      ${fu}
      <button type="button" class="link visit-edit" data-visit="${esc(v.id)}">Edit</button>
    </div>`;
  }

  // Check-in form
  const vd = $("#visit-dialog"), vf = $("#visit-form");
  let editingVisit = null, visitPartner = null;
  function openVisit(partnerId, visit) {
    const p = byId(partnerId);
    if (!p && !visit) return;
    visitPartner = partnerId; editingVisit = visit;
    $("#vd-title").textContent = visit ? "Edit visit" : "Check in";
    $("#vd-partner").textContent = p ? `${p.name} · ${p.city}` : (visit.partnerName || "");
    vf.reset();
    vf.elements.when.value = visit ? visit.when : localDateTime(new Date());
    vf.elements.type.value = visit ? (visit.type || "Drop-in") : "Drop-in";
    vf.elements.contact.value = visit ? visit.contact || "" : "";
    vf.elements.notes.value = visit ? visit.notes || "" : "";
    vf.elements.followUp.value = visit ? visit.followUp || "" : "";
    vf.elements.followUpNote.value = visit ? visit.followUpNote || "" : "";
    vf.elements.followUpDone.checked = !!(visit && visit.followUpDone);
    $("#vd-done-wrap").hidden = !(visit && (visit.followUp || visit.followUpNote));
    $("#vd-delete").hidden = !visit;
    vd.showModal();
    if (!visit) setTimeout(() => vf.elements.notes.focus(), 50);
  }
  vf.addEventListener("submit", e => {
    e.preventDefault();
    const p = byId(visitPartner);
    const data = {
      when: vf.elements.when.value,
      type: vf.elements.type.value,
      contact: vf.elements.contact.value.trim(),
      notes: vf.elements.notes.value.trim(),
      followUp: vf.elements.followUp.value,
      followUpNote: vf.elements.followUpNote.value.trim(),
      followUpDone: vf.elements.followUpDone.checked
    };
    const now = stamp();
    if (editingVisit) Object.assign(editingVisit, data, { updated: now });
    else state.visits.push(Object.assign({ id: uid(), partnerId: visitPartner, partnerName: p ? p.name : "", created: now, updated: now }, data));
    save(true); vd.close();
    toast(editingVisit ? "Visit updated." : `Checked in at ${p ? p.name : "partner"}.`);
    renderPartnerDetail(); refreshAll();
  });
  $("#vd-delete").addEventListener("click", () => {
    if (!editingVisit || !confirm("Delete this visit? This can't be undone.")) return;
    state.visits = state.visits.filter(v => v !== editingVisit);
    state.deletedVisits[editingVisit.id] = stamp();
    save(true); vd.close(); toast("Visit deleted.");
    renderPartnerDetail(); refreshAll();
  });

  // Add / edit partner
  const ed = $("#edit-dialog"), ef = $("#edit-form");
  let editingPartner = null;
  function openEdit(id, presetName) {
    const p = id ? byId(id) : null;
    editingPartner = p;
    $("#ed-title").textContent = p ? "Edit partner" : "Add partner";
    ef.reset();
    ef.elements.name.value = p ? p.name : (presetName || "");
    ef.elements.address.value = p ? p.address : "";
    ef.elements.city.value = p ? p.city : (state.settings.city || "");
    ef.elements.state.value = p ? p.state : "CO";
    ef.elements.zip.value = p ? p.zip || "" : "";
    $("#ed-delete").hidden = !p;
    ed.showModal();
  }
  $("#add-partner-btn").addEventListener("click", () => openEdit(null, searchEl.value.trim()));
  ef.addEventListener("submit", e => {
    e.preventDefault();
    const data = {
      name: ef.elements.name.value.trim(), address: ef.elements.address.value.trim(), city: ef.elements.city.value.trim(),
      state: ef.elements.state.value.trim().toUpperCase(), zip: ef.elements.zip.value.trim()
    };
    if (editingPartner) {
      const now = stamp();
      Object.assign(editingPartner, data, { updated: now });
      state.visits.forEach(v => { if (v.partnerId === editingPartner.id && v.partnerName !== data.name) { v.partnerName = data.name; v.updated = now; } });
      if (currentPartner === editingPartner.id) openPartner(editingPartner.id);
    } else {
      state.partners.push(Object.assign({ id: "p-" + uid(), updated: stamp() }, data));
    }
    routeResult = null; save(true); ed.close();
    toast(editingPartner ? "Partner updated." : `Added ${data.name}.`);
    refreshAll();
  });
  $("#ed-delete").addEventListener("click", () => {
    const p = editingPartner;
    if (!p || !confirm(`Remove ${p.name} from your list? Past visits stay in your visit log.`)) return;
    state.partners = state.partners.filter(x => x !== p);
    if (!state.removed.includes(p.id)) state.removed.push(p.id);
    state.removedAt[p.id] = stamp();
    state.route = state.route.filter(id => id !== p.id);
    routeResult = null; save(true); ed.close();
    if (pd.open) pd.close();
    toast(`Removed ${p.name}.`);
    refreshAll();
  });

  // ---------- Visits log ----------
  const visitSearchEl = $("#visit-search"), visitCityEl = $("#visit-city-filter"), visitRangeEl = $("#visit-range");
  function filteredVisits() {
    const q = visitSearchEl.value.trim().toLowerCase();
    const city = visitCityEl.value;
    const range = visitRangeEl.value;
    return state.visits.filter(v => {
      const p = byId(v.partnerId);
      if (city && (!p || p.city !== city)) return false;
      if (range !== "all" && daysAgo(v.when) > Number(range)) return false;
      if (!q) return true;
      const hay = [p ? p.name : v.partnerName, p ? p.city : "", v.type, v.contact, v.notes, v.followUpNote].join(" ").toLowerCase();
      return hay.includes(q);
    }).sort((a, b) => b.when.localeCompare(a.when));
  }
  function renderVisits() {
    const keepCity = visitCityEl.value;
    visitCityEl.innerHTML = cityOptions(keepCity).replace(/All cities \(\d+\)/, "All cities");
    const open = state.visits.filter(v => v.followUp && !v.followUpDone).sort((a, b) => a.followUp.localeCompare(b.followUp));
    $("#followups").innerHTML = open.length ? `<div class="card followups">
      <h2>Follow-ups</h2>
      ${open.map(v => {
        const p = byId(v.partnerId);
        const late = v.followUp < today();
        return `<div class="fu-row">
          <div><button type="button" class="visit-title" data-visit="${esc(v.id)}">${esc(p ? p.name : v.partnerName)}</button>
          <div class="small ${late ? "" : "muted"}" style="${late ? "color:var(--warn);font-weight:600" : ""}">${esc(fmtDate(v.followUp))} · ${esc(relDay(v.followUp))}${v.followUpNote ? " · " + esc(v.followUpNote) : ""}</div></div>
          <button type="button" class="btn small ghost" data-fu-done="${esc(v.id)}">Done</button>
        </div>`;
      }).join("")}
    </div>` : "";
    const list = filteredVisits();
    $("#visit-count").textContent = `${list.length} visit${list.length === 1 ? "" : "s"}`;
    $("#visit-list").innerHTML = list.length ? list.map(v => visitCard(v, true)).join("")
      : `<p class="empty">${state.visits.length ? "No visits match." : "No visits yet. Find a partner in the Partners tab and tap <b>Check in</b>."}</p>`;
    const lb = state.settings.lastBackup;
    $("#backup-info").textContent = lb ? `Last backup downloaded ${relDay(lb)}.` : (state.visits.length ? "You haven't downloaded a backup yet." : "");
    renderBadges();
  }
  [visitSearchEl, visitRangeEl, visitCityEl].forEach(el => el.addEventListener(el === visitSearchEl ? "input" : "change", renderVisits));

  function csvCell(s) { s = String(s == null ? "" : s); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
  $("#export-csv-btn").addEventListener("click", () => {
    const rows = [["Date", "Time", "Partner", "City", "Address", "Type", "Saw", "Notes", "Follow-up date", "Follow-up", "Follow-up done"]];
    filteredVisits().forEach(v => {
      const p = byId(v.partnerId);
      const [d, t] = v.when.split("T");
      rows.push([d, t || "", p ? p.name : v.partnerName, p ? p.city : "", p ? fullAddress(p) : "", v.type, v.contact, v.notes, v.followUp, v.followUpNote, v.followUpDone ? "Yes" : ""]);
    });
    download(`Partner visits ${today()}.csv`, "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n"), "text/csv");
  });
  $("#backup-btn").addEventListener("click", () => {
    state.settings.lastBackup = today(); save();
    const copy = JSON.parse(JSON.stringify(state));
    delete copy.settings.syncKey; delete copy.settings.syncUrl; // never put the passcode in a file
    download(`Partner CRM backup ${today()}.json`, JSON.stringify({ app: "rah-partners", version: 1, saved: new Date().toISOString(), state: copy }, null, 2), "application/json");
    renderVisits();
  });
  $("#restore-input").addEventListener("change", async e => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== "rah-partners" || !data.state) throw new Error("not a backup");
      const n = (data.state.visits || []).length;
      if (!confirm(`Replace everything on this device with the backup from ${fmtDate(data.saved.slice(0, 10))} (${n} visits)?`)) return;
      const keep = { syncKey: state.settings.syncKey, syncUrl: state.settings.syncUrl };
      localStorage.setItem(STORE_KEY, JSON.stringify(data.state));
      state = loadState(); routeResult = null;
      Object.assign(state.settings, keep);
      // Make restored records count as the newest, so they go to the sheet.
      const now = stamp();
      state.visits.forEach(v => { v.updated = now; });
      state.partners.forEach(p => { p.updated = now; });
      save(true);
      sortEl.value = state.settings.sort;
      toast("Backup restored.");
      showTab("visits");
    } catch (err) {
      alert("That file isn't a backup from this site.");
    }
  });

  // ---------- Geocoding (OpenStreetMap Nominatim, cached in the browser) ----------
  let lastGeoRequest = 0;
  async function nominatim(params) {
    const wait = lastGeoRequest + 1100 - Date.now(); // their limit is 1 request a second
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastGeoRequest = Date.now();
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&" + new URLSearchParams(params);
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error("geocoder " + res.status);
    const j = await res.json();
    return j && j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
  }
  function streetOnly(a) { // drop suite / unit numbers, which confuse the geocoder
    return a.replace(/,?\s*(#|\b(ste|suite|unit|apt|bldg|building|room|rm)\b\.?)\s*[\w-]+\s*$/i, "").trim();
  }
  async function geocodeText(text) {
    const key = "q:" + text.toLowerCase();
    if (geoCache[key]) return geoCache[key];
    const hit = await nominatim({ q: text });
    if (hit) { geoCache[key] = hit; saveGeo(); }
    return hit;
  }
  async function geocodePartner(p) {
    const key = fullAddress(p).toLowerCase();
    if (geoCache[key]) return geoCache[key];
    const street = streetOnly(p.address);
    let hit = await nominatim({ street, city: p.city, state: p.state, postalcode: p.zip || "" });
    if (!hit) hit = await nominatim({ q: `${street}, ${p.city}, ${p.state} ${p.zip || ""}` });
    if (!hit) { hit = await nominatim({ street, city: p.city, state: p.state }); }
    if (!hit && p.zip) { hit = await nominatim({ postalcode: p.zip, country: "us" }); if (hit) hit.approx = true; }
    if (!hit) { hit = await nominatim({ city: p.city, state: p.state }); if (hit) hit.approx = true; }
    if (hit) { geoCache[key] = hit; saveGeo(); }
    return hit;
  }
  function getHere() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("no geolocation"));
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => reject(err), { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
    });
  }

  // ---------- Driving distances ----------
  function haversine(a, b) { // km
    const R = 6371, toRad = x => x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  async function travelMatrix(points) {
    // Try real driving times from the public OSRM router; fall back to straight-line estimates.
    try {
      const coords = points.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 12000);
      const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`, { signal: ctl.signal });
      clearTimeout(timer);
      const j = await res.json();
      if (j.code === "Ok" && j.durations && j.durations.every(r => r.every(x => x != null))) {
        return { time: j.durations, dist: j.distances.map(r => r.map(m => m / 1000)), real: true };
      }
    } catch (e) { /* fall through */ }
    const dist = points.map(a => points.map(b => haversine(a, b) * 1.3)); // roads aren't straight
    const time = dist.map(r => r.map(km => km / 45 * 3600)); // ~28 mph average around town
    return { time, dist, real: false };
  }

  // ---------- Route optimization ----------
  // Node 0 is the start. cost[i][0] is 0 when the route can finish anywhere.
  function tourCost(order, c) {
    let s = c[0][order[0]];
    for (let i = 1; i < order.length; i++) s += c[order[i - 1]][order[i]];
    return s + c[order[order.length - 1]][0];
  }
  function exactOrder(c, m) { // Held–Karp; fine up to ~15 stops
    const FULL = 1 << m, INF = Infinity;
    const dp = new Float64Array(FULL * m).fill(INF), parent = new Int8Array(FULL * m).fill(-1);
    for (let j = 0; j < m; j++) dp[(1 << j) * m + j] = c[0][j + 1];
    for (let mask = 1; mask < FULL; mask++) {
      for (let j = 0; j < m; j++) {
        const cur = dp[mask * m + j];
        if (cur === INF || !(mask & (1 << j))) continue;
        for (let k = 0; k < m; k++) {
          if (mask & (1 << k)) continue;
          const nm = mask | (1 << k), v = cur + c[j + 1][k + 1];
          if (v < dp[nm * m + k]) { dp[nm * m + k] = v; parent[nm * m + k] = j; }
        }
      }
    }
    let best = INF, last = 0;
    for (let j = 0; j < m; j++) { const v = dp[(FULL - 1) * m + j] + c[j + 1][0]; if (v < best) { best = v; last = j; } }
    const order = []; let mask = FULL - 1, j = last;
    while (j >= 0) { order.push(j + 1); const pj = parent[mask * m + j]; mask &= ~(1 << j); j = pj; }
    return order.reverse();
  }
  function heuristicOrder(c, m) { // nearest neighbour from every first stop, then local improvements
    let best = null, bestCost = Infinity;
    for (let first = 1; first <= m; first++) {
      const left = new Set(); for (let i = 1; i <= m; i++) if (i !== first) left.add(i);
      const order = [first];
      while (left.size) {
        const at = order[order.length - 1]; let nx = null, nd = Infinity;
        left.forEach(k => { if (c[at][k] < nd) { nd = c[at][k]; nx = k; } });
        order.push(nx); left.delete(nx);
      }
      improve(order, c);
      const cost = tourCost(order, c);
      if (cost < bestCost) { bestCost = cost; best = order.slice(); }
    }
    return best;
  }
  function improve(order, c) {
    let cost = tourCost(order, c), better = true, guard = 0;
    while (better && guard++ < 200) {
      better = false;
      for (let i = 0; i < order.length - 1; i++) { // reverse a stretch
        for (let j = i + 1; j < order.length; j++) {
          const t = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
          const tc = tourCost(t, c);
          if (tc < cost - 1e-9) { order.splice(0, order.length, ...t); cost = tc; better = true; }
        }
      }
      for (let i = 0; i < order.length; i++) { // move one stop elsewhere
        for (let j = 0; j < order.length; j++) {
          if (i === j) continue;
          const t = order.slice(); const [x] = t.splice(i, 1); t.splice(j, 0, x);
          const tc = tourCost(t, c);
          if (tc < cost - 1e-9) { order.splice(0, order.length, ...t); cost = tc; better = true; }
        }
      }
    }
  }

  // ---------- Route tab ----------
  let routeResult = null; // { stops:[ids], start:{label,lat,lng,mapsValue}|null, legs:[{km,sec}], real, endMode, approx:[ids] }
  const startModeEl = $("#start-mode"), endModeEl = $("#end-mode"), startAddrEl = $("#start-address");
  startModeEl.value = state.settings.startMode;
  endModeEl.value = state.settings.endMode;
  startAddrEl.value = state.settings.startAddress;
  function syncStartFields() { $("#start-address-wrap").hidden = startModeEl.value !== "address"; }
  syncStartFields();
  startModeEl.addEventListener("change", () => { state.settings.startMode = startModeEl.value; routeResult = null; save(); syncStartFields(); renderRoute(); });
  endModeEl.addEventListener("change", () => { state.settings.endMode = endModeEl.value; routeResult = null; save(); renderRoute(); });
  startAddrEl.addEventListener("change", () => { state.settings.startAddress = startAddrEl.value.trim(); routeResult = null; save(); renderRoute(); });

  const fmtMi = km => (km * 0.621371).toFixed(km < 16 ? 1 : 0) + " mi";
  const fmtMin = sec => { const m = Math.round(sec / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`; };

  function renderRoute() {
    state.route = state.route.filter(id => byId(id));
    const box = $("#route-stops"), res = $("#route-result");
    $("#optimize-btn").disabled = !state.route.length;
    $("#clear-route-btn").hidden = !state.route.length;
    if (!state.route.length) {
      box.innerHTML = `<p class="empty">No stops yet. Go to <b>Partners</b> and tap <b>+ Route</b> on the places you want to visit.</p>`;
      res.innerHTML = ""; $("#route-status").textContent = ""; renderBadges(); return;
    }
    if (routeResult) {
      box.innerHTML = "";
      const r = routeResult;
      const totalKm = r.legs.reduce((s, l) => s + l.km, 0), totalSec = r.legs.reduce((s, l) => s + l.sec, 0);
      let html = `<p class="route-summary">${r.stops.length} stop${r.stops.length === 1 ? "" : "s"} · ${fmtMi(totalKm)} · about ${fmtMin(totalSec)} driving${r.real ? "" : " (estimate)"}</p>`;
      let li = 0;
      if (r.start) html += stopRow("S", r.start.label, "", null, true);
      r.stops.forEach((id, i) => {
        const p = byId(id);
        const leg = (r.start || i > 0) ? r.legs[li++] : null;
        const approx = r.approx.includes(id) ? " · location approximate" : "";
        html += stopRow(i + 1, p.name, fullAddress(p), leg ? `${fmtMi(leg.km)} · ${fmtMin(leg.sec)}${approx}` : approx.slice(3), false, id);
      });
      if (r.endMode === "return" && r.start) {
        const leg = r.legs[li];
        html += stopRow("S", "Back to start", "", leg ? `${fmtMi(leg.km)} · ${fmtMin(leg.sec)}` : "", true);
      }
      const links = mapsLinks(r);
      html += `<div class="maps-links">${links.map((u, i) => `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">Open in Google Maps${links.length > 1 ? ` — part ${i + 1} of ${links.length}` : ""}</a>`).join("")}</div>`;
      if (links.length > 1) html += `<p class="muted small">Google Maps takes up to ${MAX_WAYPOINTS + 1} stops per link, so the route is split. Open part 2 when you finish part 1.</p>`;
      if (!r.real) html += `<p class="muted small">Couldn't reach the driving-time service, so the order is based on distance. Google Maps will show the real times.</p>`;
      res.innerHTML = html;
    } else {
      res.innerHTML = "";
      box.innerHTML = state.route.map((id, i) => {
        const p = byId(id);
        return stopRow(i + 1, p.name, fullAddress(p), "", false, id);
      }).join("");
    }
    renderBadges();
  }
  function stopRow(num, name, addr, leg, isStart, id) {
    return `<div class="stop">
      <span class="stop-num${isStart ? " start" : ""}">${esc(num)}</span>
      <div class="stop-body">
        <div class="partner-name">${esc(name)}</div>
        ${addr ? `<div class="partner-addr">${esc(addr)}</div>` : ""}
        ${leg ? `<div class="stop-leg">${esc(leg)}</div>` : ""}
      </div>
      ${id ? `<div class="partner-btns">
        <button type="button" class="btn small" data-checkin="${esc(id)}">Check in</button>
        <button type="button" class="link danger" data-remove-stop="${esc(id)}" aria-label="Remove ${esc(name)} from route">Remove</button>
      </div>` : ""}
    </div>`;
  }
  function mapsLinks(r) {
    const pts = [];
    if (r.start) pts.push(r.start.mapsValue);
    r.stops.forEach(id => pts.push(fullAddress(byId(id))));
    if (r.endMode === "return" && r.start) pts.push(r.start.mapsValue);
    const links = [];
    if (pts.length === 1) return ["https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent(pts[0])];
    for (let i = 0; i < pts.length - 1; i += MAX_WAYPOINTS + 1) {
      const end = Math.min(i + MAX_WAYPOINTS + 1, pts.length - 1);
      const params = new URLSearchParams({ api: "1", travelmode: "driving", origin: pts[i], destination: pts[end] });
      const mid = pts.slice(i + 1, end);
      if (mid.length) params.set("waypoints", mid.join("|"));
      links.push("https://www.google.com/maps/dir/?" + params.toString());
    }
    return links;
  }

  $("#clear-route-btn").addEventListener("click", () => {
    if (!confirm("Remove all stops from your route?")) return;
    state.route = []; routeResult = null; save(); renderRoute();
  });

  $("#optimize-btn").addEventListener("click", async () => {
    const status = $("#route-status"), btn = $("#optimize-btn");
    const ids = state.route.slice();
    const mode = startModeEl.value, endMode = endModeEl.value;
    btn.disabled = true;
    try {
      // 1. Where are we starting?
      let start = null;
      if (mode === "here") {
        status.textContent = "Finding your location…";
        try {
          const here = await getHere();
          start = { label: "Your location", lat: here.lat, lng: here.lng, mapsValue: `${here.lat.toFixed(6)},${here.lng.toFixed(6)}` };
        } catch (e) {
          status.textContent = "Couldn't get your location. Allow location access, or choose \"An address…\" as the start.";
          return;
        }
      } else if (mode === "address") {
        const text = startAddrEl.value.trim();
        if (!text) { status.textContent = "Type a start address first."; startAddrEl.focus(); return; }
        status.textContent = "Looking up your start address…";
        const hit = await geocodeText(text);
        if (!hit) { status.textContent = "Couldn't find that start address. Try adding the city and zip code."; return; }
        start = { label: text, lat: hit.lat, lng: hit.lng, mapsValue: text };
      }
      // 2. Where are the stops?
      const pts = [], approx = [], missing = [];
      for (let i = 0; i < ids.length; i++) {
        const p = byId(ids[i]);
        const cached = geoCache[fullAddress(p).toLowerCase()];
        if (!cached) status.textContent = `Looking up addresses… ${i + 1} of ${ids.length} (first time only)`;
        let hit = null;
        try { hit = cached || await geocodePartner(p); } catch (e) { hit = null; }
        if (!hit) missing.push(p.name); else { pts.push(hit); if (hit.approx) approx.push(p.id); }
      }
      if (missing.length) { status.textContent = `Couldn't find the address for: ${missing.join(", ")}. Check it under Edit partner details, or remove it from the route.`; return; }
      // 3. Travel times and best order.
      status.textContent = "Working out the best order…";
      const nodes = start ? [start, ...pts] : [pts[0], ...pts]; // without a start, node 0 is a free "anywhere" start
      const tm = await travelMatrix(nodes);
      const m = ids.length;
      const c = tm.time.map((row, i) => row.map((v, j) => {
        if (!start && (i === 0 || j === 0)) return 0;
        if (j === 0 && endMode !== "return") return 0;
        return v;
      }));
      const order = m <= 1 ? [1] : (m <= 15 ? exactOrder(c, m) : heuristicOrder(c, m));
      const stops = order.map(k => ids[k - 1]);
      const legs = [];
      const seq = start ? [0, ...order] : order;
      for (let i = 1; i < seq.length; i++) legs.push({ km: tm.dist[seq[i - 1]][seq[i]], sec: tm.time[seq[i - 1]][seq[i]] });
      if (start && endMode === "return") legs.push({ km: tm.dist[seq[seq.length - 1]][0], sec: tm.time[seq[seq.length - 1]][0] });
      state.route = stops; save();
      routeResult = { stops, start, legs, real: tm.real, endMode, approx };
      status.textContent = "";
      renderRoute();
    } catch (e) {
      status.textContent = "Something went wrong working out the route. Check your internet connection and try again.";
    } finally {
      btn.disabled = !state.route.length;
    }
  });

  // ---------- Google Sheet sync ----------
  // Every device sends all its records; the sheet keeps the newest copy of each and sends
  // everything back. "Newest" is decided by each record's `updated` time.
  const CONFIG = window.PARTNERS_CONFIG || {};
  const syncUrl = () => CONFIG.sheetUrl || state.settings.syncUrl || "";
  const syncOn = () => !!(syncUrl() && state.settings.syncKey);
  let syncTimer = null, syncing = false, syncAgain = false, syncError = "";

  function scheduleSync(delay) {
    if (!syncOn()) return;
    setSyncPill("pending");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, delay == null ? 2500 : delay);
  }

  function payload() {
    const visits = state.visits.map(v => {
      const p = byId(v.partnerId);
      return Object.assign({}, v, { partnerName: p ? p.name : v.partnerName, city: p ? p.city : (v.city || ""), updated: v.updated || v.created || "" });
    });
    Object.keys(state.deletedVisits).forEach(id => visits.push({ id, deleted: true, updated: state.deletedVisits[id] }));
    const partners = state.partners.map(p => Object.assign({}, p, { notes: state.notes[p.id] || "", updated: p.updated || "" }));
    state.removed.forEach(id => partners.push({ id, removed: true, updated: state.removedAt[id] || "" }));
    return { key: state.settings.syncKey, action: "sync", visits, partners };
  }

  function applyServer(res) {
    // Visits
    const localV = new Map(state.visits.map(v => [v.id, v]));
    (res.visits || []).forEach(sv => {
      if (!sv.id) return;
      const lv = localV.get(sv.id), su = sv.updated || "";
      if (sv.deleted) {
        if (lv && (lv.updated || lv.created || "") <= su) { localV.delete(sv.id); }
        if (!lv || (lv.updated || lv.created || "") <= su) state.deletedVisits[sv.id] = su;
        return;
      }
      const tomb = state.deletedVisits[sv.id];
      if (tomb && tomb >= su) return; // deleted here after the sheet's copy
      if (tomb) delete state.deletedVisits[sv.id];
      if (!lv || su >= (lv.updated || lv.created || "")) {
        const rec = { id: sv.id, partnerId: sv.partnerId || "", partnerName: sv.partnerName || "", when: sv.when || "", type: sv.type || "", contact: sv.contact || "",
          notes: sv.notes || "", followUp: sv.followUp || "", followUpNote: sv.followUpNote || "", followUpDone: !!sv.followUpDone, created: sv.created || "", updated: su };
        if (rec.when) localV.set(sv.id, rec);
      }
    });
    state.visits = [...localV.values()];
    // Partners
    const localP = new Map(state.partners.map(p => [p.id, p]));
    (res.partners || []).forEach(sp => {
      if (!sp.id) return;
      const lp = localP.get(sp.id), su = sp.updated || "";
      const removedHere = state.removed.includes(sp.id);
      if (sp.removed) {
        if (!lp || (lp.updated || "") <= su) {
          localP.delete(sp.id);
          if (!removedHere) state.removed.push(sp.id);
          state.removedAt[sp.id] = su;
          state.route = state.route.filter(id => id !== sp.id);
        }
        return;
      }
      if (removedHere) {
        if ((state.removedAt[sp.id] || "") >= su) return; // removed here more recently
        state.removed = state.removed.filter(id => id !== sp.id);
        delete state.removedAt[sp.id];
      }
      if (!lp || su >= (lp.updated || "")) {
        if (!sp.name) return;
        const rec = { id: sp.id, name: sp.name, address: sp.address || "", city: sp.city || "", state: sp.state || "CO", zip: sp.zip || "", updated: su };
        if (lp) Object.assign(lp, rec); else localP.set(sp.id, rec);
        if (sp.notes) state.notes[sp.id] = sp.notes; else delete state.notes[sp.id];
      }
    });
    state.partners = [...localP.values()];
  }

  async function syncNow(manual) {
    clearTimeout(syncTimer);
    if (!syncOn()) return;
    if (syncing) { syncAgain = true; return; }
    if (!navigator.onLine) { syncError = "offline"; setSyncPill("offline"); return; }
    syncing = true; setSyncPill("syncing");
    try {
      const res = await fetch(syncUrl(), {
        method: "POST", redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // plain text avoids a CORS preflight Apps Script can't answer
        body: JSON.stringify(payload())
      });
      const j = await res.json();
      if (!j.ok) {
        if (j.error === "passcode") { delete state.settings.syncKey; save(); syncError = "passcode"; toast("The Google Sheet passcode is wrong. Enter it again in Visits → Google Sheet."); }
        else if (j.error === "locked") syncError = "locked";
        else syncError = j.error || "error";
        setSyncPill("error"); renderSyncCard(); return;
      }
      applyServer(j); // edits made here while waiting are newer, so they survive the merge
      state.settings.lastSync = stamp(); syncError = "";
      save();
      if (manual) toast("Synced with Google Sheet.");
      if (!document.querySelector("dialog[open]")) refreshAll();
      setSyncPill("ok");
    } catch (e) {
      syncError = "network"; setSyncPill("error");
      if (manual) toast("Couldn't reach the Google Sheet. Your changes are saved here and will sync later.");
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
    const map = { ok: ["✓ Synced", "ok"], pending: ["Saving…", ""], syncing: ["Syncing…", ""], offline: ["Offline", "bad"], error: ["Not synced", "bad"] };
    const [txt, cls] = map[st] || map.ok;
    el.textContent = txt; el.className = "sync-pill " + cls;
  }

  function renderSyncCard() {
    const on = syncOn();
    $("#sync-form").hidden = on;
    $("#sync-connected").hidden = !on;
    $("#sync-url-wrap").hidden = !!CONFIG.sheetUrl;
    const link = $("#sheet-link");
    if (CONFIG.sheetLink) { link.href = CONFIG.sheetLink; link.hidden = false; } else link.hidden = true;
    let msg;
    if (!on) msg = state.settings.syncKey === undefined && syncError === "passcode" ? "Wrong passcode — try again." : "Not connected. Visits are only on this device.";
    else if (syncError === "network" || syncError === "offline") msg = "Couldn't reach the sheet. Changes are saved here and will sync when you're back online.";
    else if (syncError === "locked") msg = "Too many wrong passcodes were tried. Wait 15 minutes and tap Sync now.";
    else if (syncError === "not set up") msg = "The sheet's script has no PASSCODE set yet. See the setup steps.";
    else if (syncError) msg = "The sheet reported a problem: " + syncError;
    else msg = state.settings.lastSync ? `Connected. Last synced ${new Date(state.settings.lastSync).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : "Connected.";
    $("#sync-status").textContent = msg;
  }

  $("#sync-form").addEventListener("submit", e => {
    e.preventDefault();
    const key = $("#sync-key").value.trim();
    const url = $("#sync-url").value.trim();
    if (!CONFIG.sheetUrl) {
      if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { toast("Paste the web app URL from Apps Script (it starts with https://script.google.com/)."); return; }
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
    if (!confirm("Stop syncing this device? Your data stays here and in the sheet.")) return;
    delete state.settings.syncKey; save(); setSyncPill(); renderSyncCard();
  });
  $("#sync-pill").addEventListener("click", () => { showTab("visits"); $("#sync-card").scrollIntoView({ behavior: "smooth" }); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && syncOn()) {
      const last = state.settings.lastSync ? Date.parse(state.settings.lastSync) : 0;
      if (Date.now() - last > 60000) syncNow();
    }
  });
  window.addEventListener("online", () => syncOn() && syncNow());

  // ---------- Start ----------
  function refreshAll() {
    const tab = state.settings.tab;
    if (tab === "partners") renderPartners();
    else if (tab === "route") renderRoute();
    else renderVisits();
    renderBadges();
  }
  save();
  renderSyncCard(); setSyncPill("ok");
  if (syncOn()) syncNow();
  showTab(["partners", "route", "visits"].includes(state.settings.tab) ? state.settings.tab : "partners");
})();
