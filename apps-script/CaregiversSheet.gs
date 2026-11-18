/**
 * Google Sheet sync for the Caregiver Compliance page (docs/caregivers).
 *
 * The page sends its caregiver list here; this script keeps the newest copy of each
 * caregiver in the "Caregivers" tab and sends everything back, so every computer shows the
 * same list. You can also edit or add rows in the sheet; "Updated" is filled in for you and
 * the change shows on the page the next time it's opened.
 *
 * Setup: see apps-script/README.md ("Caregiver compliance sheet").
 *
 * Safety: nothing is read or written unless the request carries the passcode stored in
 * this script's properties (Project Settings > Script properties > PASSCODE). Wrong
 * passcodes are slowed down, but the right one always works, so nobody can lock you out.
 * Use at least 12 characters; the page shows a warning if the passcode is shorter.
 */

const CAREGIVERS = {
  name: "Caregivers",
  id: "Caregiver ID",
  headers: ["First name", "Last name", "Hire date", "License expires", "Insurance expires", "Training due",
    "Last training", "Notes", "Inactive", "Deleted", "Caregiver ID", "Updated"],
  toCells: function (r) {
    if (r.removed) return { "Caregiver ID": r.id, "Deleted": "Yes", "Updated": r.updated };
    return {
      "First name": r.first, "Last name": r.last, "Hire date": r.hireDate, "License expires": r.licenseExp,
      "Insurance expires": r.insuranceExp, "Training due": r.trainingDue, "Last training": r.lastTraining,
      "Notes": r.notes, "Inactive": r.inactive ? "Yes" : "", "Deleted": "", "Caregiver ID": r.id, "Updated": r.updated
    };
  },
  fromCells: function (c) {
    return {
      id: c["Caregiver ID"], first: c["First name"], last: c["Last name"], hireDate: c["Hire date"],
      licenseExp: c["License expires"], insuranceExp: c["Insurance expires"], trainingDue: c["Training due"],
      lastTraining: c["Last training"], notes: c["Notes"], inactive: yes(c["Inactive"]),
      removed: yes(c["Deleted"]), updated: c["Updated"]
    };
  }
};

const DATE_HEADERS = ["Hire date", "License expires", "Insurance expires", "Training due", "Last training"];

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
    const caregivers = merge(ss, CAREGIVERS, Array.isArray(data.caregivers) ? data.caregivers : []);
    return reply({ ok: true, now: new Date().toISOString(), weak: passcode.length < 12, caregivers: caregivers });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err).slice(0, 200) });
  } finally {
    lock.releaseLock();
  }
}

// Visiting the web app URL in a browser just confirms it's running. It never shows data.
function doGet() {
  return ContentService.createTextOutput("The caregiver compliance sync is running.");
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
 * over older copies on computers, and gives new rows an ID.
 */
function onEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== CAREGIVERS.name || e.range.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const upd = headers.indexOf("Updated") + 1, idCol = headers.indexOf(CAREGIVERS.id) + 1;
  if (!upd || (e.range.getColumn() === upd && e.range.getNumColumns() === 1)) return;
  const first = Math.max(2, e.range.getRow()), n = e.range.getLastRow() - first + 1;
  const now = new Date().toISOString();
  const ids = idCol ? sheet.getRange(first, idCol, n, 1).getValues() : null;
  for (let i = 0; i < n; i++) {
    const row = first + i;
    const values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
    if (values.every(function (v) { return v === ""; })) continue; // row was cleared
    sheet.getRange(row, upd).setNumberFormat("@").setValue(now);
    if (ids && !ids[i][0]) sheet.getRange(row, idCol).setNumberFormat("@").setValue("c-" + Utilities.getUuid().slice(0, 12));
  }
}

// ---------- helpers ----------
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
