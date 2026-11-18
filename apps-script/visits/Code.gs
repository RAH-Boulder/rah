/**
 * Supervisory Visits, hosted by Google (Apps Script web app inside your Google Workspace).
 *
 * Staff open the web app link and sign in with their own work Google account. Only people
 * listed in the "Staff" tab (and the owner) can open it. Every view and change is written to
 * the "Audit log" tab with the person's email. The client list is read from the "Clients"
 * tab each time and never stored on staff computers. Nothing leaves your Google Workspace.
 *
 * Files in this Apps Script project: Code.gs (this file) and Index.html (the page).
 * Deploy as a web app with Execute as: Me, Who has access: Anyone within your organization.
 * Setup: apps-script/README.md ("Supervisory visits (Google-hosted)").
 */

const INTERVAL_DAYS = 90;

const CLIENTS = {
  name: "Clients",
  id: "Client ID",
  headers: ["First name", "Last name", "Last visit", "Next due", "Scheduled visit", "Notes", "On hold",
    "Hold reason", "Hold since", "Ended", "Ended on", "Inactive", "Deleted", "Client ID", "Updated"],
  toCells: function (r) {
    return {
      "First name": r.first, "Last name": r.last, "Last visit": r.lastVisit, "Next due": r.nextDue,
      "Scheduled visit": r.scheduled, "Notes": r.notes, "On hold": r.onHold ? "Yes" : "", "Hold reason": r.holdReason,
      "Hold since": r.holdSince, "Ended": r.endReason === "deceased" ? "Deceased" : r.endReason ? "Ended care" : "",
      "Ended on": r.endedOn, "Inactive": r.inactive ? "Yes" : "", "Client ID": r.id, "Updated": r.updated
    };
  },
  fromCells: function (c) {
    return {
      id: c["Client ID"], first: c["First name"], last: c["Last name"], lastVisit: c["Last visit"],
      nextDue: c["Next due"], scheduled: c["Scheduled visit"], notes: c["Notes"], onHold: yes(c["On hold"]),
      holdReason: c["Hold reason"], holdSince: c["Hold since"], endReason: endReason(c["Ended"]), endedOn: c["Ended on"],
      inactive: yes(c["Inactive"]) || !!endReason(c["Ended"]), removed: yes(c["Deleted"]), updated: c["Updated"]
    };
  }
};
const STAFF = { name: "Staff", headers: ["Email", "Name", "Notes"] };
const AUDIT = { name: "Audit log", headers: ["Time", "User", "Action", "Client", "Client ID", "Details"] };

const DATE_HEADERS = ["Last visit", "Next due", "Scheduled visit", "Hold since", "Ended on"];
const TEXT_FIELDS = ["first", "last", "lastVisit", "nextDue", "scheduled", "notes", "holdReason", "holdSince", "endReason", "endedOn"];

// ---------- The page ----------
function doGet() {
  let user;
  try { user = requireStaff(); } catch (err) {
    // Say which account Google reports, so a mismatch (or no account at all) is easy to spot.
    const seen = String(Session.getActiveUser().getEmail() || "").trim();
    const who = seen
      ? "<p>You're signed in as <b>" + escapeHtml(seen) + "</b>. Ask the office to add exactly this email to the Staff tab, then reload this page.</p>"
      : "<p>Google didn't tell this page which account you're signed in with. Open the link while signed in to only your work Google account (an incognito window works), then reload.</p>";
    return HtmlService.createHtmlOutput(
      '<div style="font:16px/1.5 system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 16px">' +
      "<h1 style=\"font-size:1.25rem\">Supervisory Visits</h1><p>You don't have access to this page.</p>" + who + "</div>")
      .setTitle("Supervisory Visits")
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  }
  const page = HtmlService.createTemplateFromFile("Index");
  page.userEmail = user;
  return page.evaluate()
    .setTitle("Supervisory Visits")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// ---------- Called by the page ----------
/** The whole client list. `opened` is true when the page has just been opened (logged as a view). */
function getClients(opened) {
  const user = requireStaff();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  tab(ss, STAFF); // so the Staff tab is there to fill in
  const clients = readClients(ss).list.filter(function (r) { return r.id && !r.removed; });
  if (opened) audit(ss, user, "Opened the list", "", "", clients.length + " clients");
  return { user: user, clients: clients };
}

/**
 * Saves one client (adds it if new). If someone else changed this client since the page loaded
 * it, nothing is saved and the newest copy is sent back instead.
 */
function saveClient(inc, action) {
  const user = requireStaff();
  if (!inc || typeof inc !== "object") throw new Error("Nothing to save.");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = readClients(ss);
    let id = String(inc.id || "");
    if (!/^[\w-]{1,80}$/.test(id)) id = "";
    const found = id ? data.byId[id] : null;
    if (found && String(inc.updated || "") < String(found.rec.updated || "")) {
      return { conflict: true, client: found.rec };
    }
    if (!id) id = "v-" + Utilities.getUuid().slice(0, 12);

    const rec = { id: id, updated: new Date().toISOString(), onHold: !!inc.onHold, inactive: !!inc.inactive || !!inc.endReason };
    TEXT_FIELDS.forEach(function (f) { rec[f] = String(inc[f] == null ? "" : inc[f]); });
    if (!rec.first.trim() && !rec.last.trim()) throw new Error("A client needs a name.");

    const cells = CLIENTS.toCells(rec);
    const headers = data.headers;
    const row = found ? data.rows[found.index] : headers.map(function () { return ""; });
    headers.forEach(function (h, j) { if (h in cells) row[j] = clean(cells[h], h); });
    const range = found ? data.sheet.getRange(found.index + 2, 1, 1, headers.length)
      : data.sheet.getRange(data.sheet.getLastRow() + 1, 1, 1, headers.length);
    range.setNumberFormat("@").setValues([row]);

    const saved = CLIENTS.fromCells(rowCells(headers, row, data.tz));
    const name = (saved.first + " " + saved.last).trim();
    audit(ss, user, String(action || (found ? "Edited client" : "Added client")).slice(0, 80), name, id,
      found ? changes(found.rec, saved) : "New client: " + describe(saved));
    return { client: saved };
  } finally {
    lock.releaseLock();
  }
}

/** Records something done on the page that doesn't change data (e.g. copying the due list). */
function logEvent(action, details) {
  const user = requireStaff();
  audit(SpreadsheetApp.getActiveSpreadsheet(), user, String(action || "").slice(0, 80), "", "", String(details || "").slice(0, 500));
  return true;
}

// ---------- Who can use it ----------
/** The signed-in person's email, if they're the owner or listed in the Staff tab. */
function requireStaff() {
  const email = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  if (!email) throw new Error("Not signed in.");
  const owner = String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase();
  if (email === owner) return email;
  const sheet = tab(SpreadsheetApp.getActiveSpreadsheet(), STAFF);
  const last = sheet.getLastRow();
  const emails = last > 1 ? sheet.getRange(2, 1, last - 1, 1).getValues() : [];
  for (let i = 0; i < emails.length; i++) {
    if (String(emails[i][0] || "").trim().toLowerCase() === email) return email;
  }
  throw new Error("No access.");
}

// ---------- Audit log ----------
function audit(ss, user, action, client, id, details) {
  const sheet = tab(ss, AUDIT);
  sheet.appendRow([new Date(), user, clean(action), clean(client), clean(id), clean(details)]);
}

const LABELS = {
  first: "First name", last: "Last name", lastVisit: "Last visit", nextDue: "Next due", scheduled: "Scheduled visit",
  notes: "Notes", onHold: "On hold", holdReason: "Hold reason", endReason: "Ended", endedOn: "Ended on"
};
function show(k, v) {
  if (k === "onHold") return v ? "Yes" : "No";
  if (k === "endReason") return v === "deceased" ? "Deceased" : v ? "Ended care" : "—";
  return v === "" || v == null ? "—" : String(v);
}
function changes(a, b) {
  const out = [];
  Object.keys(LABELS).forEach(function (k) {
    const x = k === "onHold" ? !!a[k] : String(a[k] || ""), y = k === "onHold" ? !!b[k] : String(b[k] || "");
    if (x !== y) out.push(LABELS[k] + ": " + show(k, x) + " → " + show(k, y));
  });
  return out.join("; ") || "No changes";
}
function describe(r) {
  return ["lastVisit", "nextDue", "scheduled"].filter(function (k) { return r[k]; })
    .map(function (k) { return LABELS[k] + " " + r[k]; }).join("; ");
}

// ---------- Reading the Clients tab ----------
function readClients(ss) {
  const sheet = tab(ss, CLIENTS);
  const tz = ss.getSpreadsheetTimeZone();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
  const byId = {};
  const list = rows.map(function (row, i) {
    const rec = CLIENTS.fromCells(rowCells(headers, row, tz));
    if (!rec.nextDue && rec.lastVisit) rec.nextDue = nextVisit(rec.lastVisit); // row typed in by hand
    if (rec.id) byId[rec.id] = { index: i, rec: rec };
    return rec;
  });
  return { sheet: sheet, tz: tz, headers: headers, rows: rows, list: list, byId: byId };
}

/**
 * Runs by itself when you edit the Clients tab by hand: stamps "Updated", gives new rows an ID,
 * and when "Last visit" is changed fills in "Next due" (90 days later, on the closest weekday).
 */
function onEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== CLIENTS.name || e.range.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const upd = headers.indexOf("Updated") + 1, idCol = headers.indexOf(CLIENTS.id) + 1;
  if (!upd || (e.range.getColumn() === upd && e.range.getNumColumns() === 1)) return;
  const first = Math.max(2, e.range.getRow()), n = e.range.getLastRow() - first + 1;
  const now = new Date().toISOString();
  const ids = idCol ? sheet.getRange(first, idCol, n, 1).getValues() : null;
  const lastCol = headers.indexOf("Last visit") + 1, dueCol = headers.indexOf("Next due") + 1;
  const visitEdited = lastCol && lastCol >= e.range.getColumn() && lastCol <= e.range.getLastColumn();
  const tz = e.source.getSpreadsheetTimeZone();
  for (let i = 0; i < n; i++) {
    const row = first + i;
    const values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
    if (values.every(function (v) { return v === ""; })) continue; // row was cleared
    sheet.getRange(row, upd).setNumberFormat("@").setValue(now);
    if (ids && !ids[i][0]) sheet.getRange(row, idCol).setNumberFormat("@").setValue("v-" + Utilities.getUuid().slice(0, 12));
    if (visitEdited && dueCol) {
      const due = nextVisit(cellText(values[lastCol - 1], "Last visit", tz));
      if (due) sheet.getRange(row, dueCol).setNumberFormat("@").setValue(due);
    }
  }
}

// ---------- helpers ----------
// 90 days after a "yyyy-MM-dd" date; Saturday moves to the Friday before, Sunday to the Monday after.
function nextVisit(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + INTERVAL_DAYS));
  const w = d.getUTCDay();
  if (w === 6) d.setUTCDate(d.getUTCDate() - 1);
  if (w === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// "Ended" column: "Deceased" or "Ended care" (other wording typed by hand is understood too).
function endReason(v) {
  const s = String(v || "");
  return /deceas|died|passed/i.test(s) ? "deceased" : /end|discharg/i.test(s) ? "ended" : "";
}

function tab(ss, spec) {
  let sheet = ss.getSheetByName(spec.name);
  if (!sheet) {
    sheet = ss.insertSheet(spec.name);
    sheet.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]).setFontWeight("bold");
    sheet.setFrozenRows(1);
    return sheet;
  }
  // Add any missing columns at the end, so you can reorder or add your own columns freely.
  const have = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
  const missing = spec.headers.filter(function (h) { return have.indexOf(h) < 0; });
  if (missing.length) sheet.getRange(1, have.length + 1, 1, missing.length).setValues([missing]).setFontWeight("bold");
  return sheet;
}

function rowCells(headers, row, tz) {
  const c = {};
  headers.forEach(function (h, j) { c[h] = cellText(row[j], h, tz); });
  return c;
}

function cellText(v, header, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, DATE_HEADERS.indexOf(header) >= 0 ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm:ss");
  if (v === true) return "Yes";
  if (v === false) return "";
  let s = String(v == null ? "" : v).trim();
  if (/^'[=+\-@]/.test(s)) s = s.slice(1); // undo the formula guard from clean()
  if (DATE_HEADERS.indexOf(header) >= 0) s = normDate(s);
  return s;
}

// Dates typed by hand, e.g. 11/8/2026, become 2026-11-08.
function normDate(s) {
  if (!s || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!m) return s;
  const y = m[3].length === 2 ? "20" + m[3] : m[3];
  return y + "-" + ("0" + m[1]).slice(-2) + "-" + ("0" + m[2]).slice(-2);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
}

function yes(v) { return /^(yes|y|true|x|✓)$/i.test(String(v || "").trim()); }

// Plain text only, at most 2000 characters, and never read as a formula.
function clean(v, header) {
  let s = String(v == null ? "" : v).slice(0, 2000);
  if (header && DATE_HEADERS.indexOf(header) >= 0 && s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) s = "";
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
