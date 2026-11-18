/**
 * Google Sheet sync for the Supervisory Visits page (docs/visits).
 *
 * The page sends its client list here; this script keeps the newest copy of each client in
 * the "Clients" tab and sends everything back, so every computer shows the same list. You can
 * also edit or add rows in the sheet; "Updated" is filled in for you, and typing a new
 * "Last visit" fills in "Next due" (90 days later, on the closest weekday).
 *
 * Setup: see apps-script/README.md ("Supervisory visits sheet").
 *
 * Safety: nothing is read or written unless the request carries the passcode stored in
 * this script's properties (Project Settings > Script properties > PASSCODE). Wrong
 * passcodes are slowed down, but the right one always works, so nobody can lock you out.
 * Use at least 12 characters; the page shows a warning if the passcode is shorter.
 */

const INTERVAL_DAYS = 90;

const CLIENTS = {
  name: "Clients",
  id: "Client ID",
  headers: ["First name", "Last name", "Last visit", "Next due", "Scheduled visit", "Notes", "On hold",
    "Hold reason", "Hold since", "Ended", "Ended on", "Inactive", "Deleted", "Client ID", "Updated"],
  toCells: function (r) {
    if (r.removed) return { "Client ID": r.id, "Deleted": "Yes", "Updated": r.updated };
    return {
      "First name": r.first, "Last name": r.last, "Last visit": r.lastVisit, "Next due": r.nextDue,
      "Scheduled visit": r.scheduled, "Notes": r.notes, "On hold": r.onHold ? "Yes" : "", "Hold reason": r.holdReason,
      "Hold since": r.holdSince, "Ended": r.endReason === "deceased" ? "Deceased" : r.endReason ? "Ended care" : "",
      "Ended on": r.endedOn, "Inactive": r.inactive ? "Yes" : "", "Deleted": "",
      "Client ID": r.id, "Updated": r.updated
    };
  },
  fromCells: function (c) {
    return {
      id: c["Client ID"], first: c["First name"], last: c["Last name"], lastVisit: c["Last visit"],
      nextDue: c["Next due"], scheduled: c["Scheduled visit"], notes: c["Notes"], onHold: yes(c["On hold"]),
      holdReason: c["Hold reason"], holdSince: c["Hold since"], endReason: endReason(c["Ended"]), endedOn: c["Ended on"],
      inactive: yes(c["Inactive"]) || !!endReason(c["Ended"]),
      removed: yes(c["Deleted"]), updated: c["Updated"]
    };
  }
};

const DATE_HEADERS = ["Last visit", "Next due", "Scheduled visit", "Hold since", "Ended on"];

// "Ended" column: "Deceased" or "Ended care" (typed by hand, other wording is understood too).
function endReason(v) {
  const s = String(v || "");
  return /deceas|died|passed/i.test(s) ? "deceased" : /end|discharg/i.test(s) ? "ended" : "";
}

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: "bad request" }); }

  const passcode = PropertiesService.getScriptProperties().getProperty("PASSCODE");
  if (!passcode) return reply({ ok: false, error: "not set up" });
  if (!sameText(String(data.key || ""), passcode)) {
    // Slow down guessing without ever locking out the right passcode: each wrong try waits
    // 2 seconds, and 5 seconds once there have been more than 20 wrong tries in 15 minutes.
    const cache = CacheService.getScriptCache();
    const fails = Number(cache.get("bad-tries") || 0) + 1;
    cache.put("bad-tries", String(fails), 900);
    Utilities.sleep(fails > 20 ? 5000 : 2000);
    return reply({ ok: false, error: "passcode" });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const clients = merge(ss, CLIENTS, Array.isArray(data.clients) ? data.clients : []);
    return reply({ ok: true, now: new Date().toISOString(), weak: passcode.length < 12, clients: clients });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err).slice(0, 200) });
  } finally {
    lock.releaseLock();
  }
}

// Visiting the web app URL in a browser just confirms it's running. It never shows data.
function doGet() {
  return ContentService.createTextOutput("The supervisory visits sync is running.");
}

/** Keep the newest copy of each record (by "Updated"), then return every record in the tab. */
function merge(ss, spec, incoming) {
  const sheet = tab(ss, spec);
  const tz = ss.getSpreadsheetTimeZone();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const width = headers.length;
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];

  const byId = {};
  const records = rows.map(function (row, i) {
    const rec = spec.fromCells(rowCells(headers, row, tz));
    if (rec.id) byId[rec.id] = { index: i, rec: rec };
    return rec;
  });

  const changed = {};
  const added = [];
  const seen = {};
  incoming.forEach(function (inc) {
    if (!inc || typeof inc.id !== "string" || !inc.id || inc.id.length > 80 || seen[inc.id]) return;
    seen[inc.id] = true;
    const found = byId[inc.id];
    if (found && !(String(inc.updated || "") > String(found.rec.updated || ""))) return; // sheet copy is as new or newer
    const cells = spec.toCells(inc);
    const row = found ? rows[found.index] : headers.map(function () { return ""; });
    headers.forEach(function (h, j) { if (h in cells) row[j] = clean(cells[h], h); });
    const rec = spec.fromCells(rowCells(headers, row, tz));
    if (found) { rows[found.index] = row; records[found.index] = rec; changed[found.index] = true; found.rec = rec; }
    else { added.push(row); records.push(rec); }
  });

  const deletedCol = headers.indexOf("Deleted");
  function write(range, values) {
    range.setNumberFormat("@").setValues(values);
  }
  Object.keys(changed).forEach(function (k) {
    const i = Number(k);
    const range = sheet.getRange(i + 2, 1, 1, width);
    write(range, [rows[i]]);
    if (deletedCol >= 0 && rows[i][deletedCol] === "Yes") range.setFontColor("#9aa0a6");
  });
  if (added.length) {
    write(sheet.getRange(lastRow + 1, 1, added.length, width), added);
    if (deletedCol >= 0) added.forEach(function (row, n) {
      if (row[deletedCol] === "Yes") sheet.getRange(lastRow + 1 + n, 1, 1, width).setFontColor("#9aa0a6");
    });
  }
  return records.filter(function (r) { return r.id; });
}

/**
 * Runs by itself when you edit the sheet by hand: stamps "Updated" so your edit wins
 * over older copies on computers, gives new rows an ID, and when "Last visit" is changed
 * fills in "Next due" (90 days later, on the closest weekday).
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

// Compares every character, so the time taken doesn't hint at how much of a guess was right.
function sameText(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
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

function yes(v) { return /^(yes|y|true|x|✓)$/i.test(String(v || "").trim()); }

// Plain text only, at most 2000 characters, and never read as a formula.
function clean(v, header) {
  let s = String(v == null ? "" : v).slice(0, 2000);
  if (DATE_HEADERS.indexOf(header) >= 0 && s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) s = "";
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
