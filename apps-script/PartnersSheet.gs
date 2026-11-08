/**
 * Google Sheet sync for the Referral Partners site (docs/partners).
 *
 * The site sends its visits and partners here; this script keeps the newest copy of
 * each record in the "Visits" and "Partners" tabs and sends everything back, so all
 * your devices end up with the same data. You can also edit or add rows in the sheet
 * directly; the "Updated" column is filled in for you and the change syncs to the site.
 *
 * Setup: see apps-script/README.md ("Referral partners sheet").
 *
 * Safety: nothing is read or written unless the request carries the passcode stored in
 * this script's properties (Project Settings > Script properties > PASSCODE). After 10
 * wrong passcodes it refuses everything for 15 minutes.
 */

const VISITS = {
  name: "Visits",
  id: "Visit ID",
  headers: ["Date", "Time", "Partner", "City", "Type", "Saw", "Notes", "Follow-up date", "Follow-up",
    "Follow-up done", "Deleted", "Visit ID", "Partner ID", "Created", "Updated"],
  toCells: function (r) {
    if (r.deleted) return { "Visit ID": r.id, "Deleted": "Yes", "Updated": r.updated };
    const when = String(r.when || "").split("T");
    return {
      "Date": when[0] || "", "Time": when[1] || "", "Partner": r.partnerName, "City": r.city, "Type": r.type,
      "Saw": r.contact, "Notes": r.notes, "Follow-up date": r.followUp, "Follow-up": r.followUpNote,
      "Follow-up done": r.followUpDone ? "Yes" : "", "Deleted": "", "Visit ID": r.id, "Partner ID": r.partnerId,
      "Created": r.created, "Updated": r.updated
    };
  },
  fromCells: function (c) {
    return {
      id: c["Visit ID"], when: c["Date"] ? c["Date"] + "T" + (c["Time"] || "00:00") : "",
      partnerName: c["Partner"], city: c["City"], type: c["Type"], contact: c["Saw"], notes: c["Notes"],
      followUp: c["Follow-up date"], followUpNote: c["Follow-up"], followUpDone: yes(c["Follow-up done"]),
      deleted: yes(c["Deleted"]), partnerId: c["Partner ID"], created: c["Created"], updated: c["Updated"]
    };
  }
};

const PARTNERS = {
  name: "Partners",
  id: "Partner ID",
  headers: ["Name", "Address", "City", "State", "Zip", "Notes", "Removed", "Partner ID", "Updated"],
  toCells: function (r) {
    if (r.removed) return { "Partner ID": r.id, "Removed": "Yes", "Updated": r.updated };
    return { "Name": r.name, "Address": r.address, "City": r.city, "State": r.state, "Zip": r.zip,
      "Notes": r.notes, "Removed": "", "Partner ID": r.id, "Updated": r.updated };
  },
  fromCells: function (c) {
    return { id: c["Partner ID"], name: c["Name"], address: c["Address"], city: c["City"], state: c["State"],
      zip: c["Zip"], notes: c["Notes"], removed: yes(c["Removed"]), updated: c["Updated"] };
  }
};

const DATE_HEADERS = { "Date": "yyyy-MM-dd", "Follow-up date": "yyyy-MM-dd", "Time": "HH:mm" };

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: "bad request" }); }

  const passcode = PropertiesService.getScriptProperties().getProperty("PASSCODE");
  if (!passcode) return reply({ ok: false, error: "not set up" });
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get("bad-tries") || 0);
  if (fails >= 10) return reply({ ok: false, error: "locked" });
  if (String(data.key || "") !== passcode) {
    cache.put("bad-tries", String(fails + 1), 900);
    return reply({ ok: false, error: "passcode" });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const partners = merge(ss, PARTNERS, Array.isArray(data.partners) ? data.partners : []);
    const visits = merge(ss, VISITS, Array.isArray(data.visits) ? data.visits : []);
    return reply({ ok: true, now: new Date().toISOString(), visits: visits, partners: partners });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err).slice(0, 200) });
  } finally {
    lock.releaseLock();
  }
}

// Visiting the web app URL in a browser just confirms it's running. It never shows data.
function doGet() {
  return ContentService.createTextOutput("The referral partners sync is running.");
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
    const cells = {};
    headers.forEach(function (h, j) { cells[h] = cellText(row[j], h, tz); });
    const rec = spec.fromCells(cells);
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
    headers.forEach(function (h, j) { if (h in cells) row[j] = clean(cells[h]); });
    const rec = spec.fromCells(rowCells(headers, row));
    if (found) { rows[found.index] = row; records[found.index] = rec; changed[found.index] = true; found.rec = rec; }
    else { added.push(row); records.push(rec); }
  });

  const deletedCol = headers.indexOf(spec === VISITS ? "Deleted" : "Removed");
  Object.keys(changed).forEach(function (k) {
    const i = Number(k);
    const range = sheet.getRange(i + 2, 1, 1, width);
    range.setNumberFormat("@").setValues([rows[i]]);
    if (deletedCol >= 0 && rows[i][deletedCol] === "Yes") range.setFontColor("#9aa0a6");
  });
  if (added.length) {
    const range = sheet.getRange(lastRow + 1, 1, added.length, width);
    range.setNumberFormat("@").setValues(added);
    if (deletedCol >= 0) added.forEach(function (row, n) {
      if (row[deletedCol] === "Yes") sheet.getRange(lastRow + 1 + n, 1, 1, width).setFontColor("#9aa0a6");
    });
  }
  return records.filter(function (r) { return r.id; });
}

/**
 * Runs by itself when you edit the sheet by hand: stamps "Updated" so your edit wins
 * over older copies on devices, and gives new rows an ID.
 */
function onEdit(e) {
  const sheet = e.range.getSheet();
  const spec = sheet.getName() === VISITS.name ? VISITS : sheet.getName() === PARTNERS.name ? PARTNERS : null;
  if (!spec || e.range.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const upd = headers.indexOf("Updated") + 1, idCol = headers.indexOf(spec.id) + 1;
  if (!upd || (e.range.getColumn() === upd && e.range.getNumColumns() === 1)) return;
  const first = Math.max(2, e.range.getRow()), n = e.range.getLastRow() - first + 1;
  const now = new Date().toISOString();
  const ids = idCol ? sheet.getRange(first, idCol, n, 1).getValues() : null;
  for (let i = 0; i < n; i++) {
    const row = first + i;
    const values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
    if (values.every(function (v) { return v === ""; })) continue; // row was cleared
    sheet.getRange(row, upd).setNumberFormat("@").setValue(now);
    if (ids && !ids[i][0]) {
      const prefix = spec === VISITS ? "v-" : "p-";
      sheet.getRange(row, idCol).setNumberFormat("@").setValue(prefix + Utilities.getUuid().slice(0, 12));
    }
  }
}

// ---------- helpers ----------
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

function rowCells(headers, row) {
  const c = {};
  headers.forEach(function (h, j) { c[h] = String(row[j] == null ? "" : row[j]); });
  return c;
}

function cellText(v, header, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, DATE_HEADERS[header] || "yyyy-MM-dd'T'HH:mm:ss");
  if (v === true) return "Yes";
  if (v === false) return "";
  let s = String(v == null ? "" : v).trim();
  if (/^'[=+\-@]/.test(s)) s = s.slice(1); // undo the formula guard from clean()
  if (DATE_HEADERS[header] === "yyyy-MM-dd") s = normDate(s);
  if (header === "Time") s = normTime(s);
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

// Times typed by hand, e.g. 2:30 PM, become 14:30.
function normTime(s) {
  const m = String(s).match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap])?\.?m?\.?$/i);
  if (!m) return s;
  let h = Number(m[1]);
  if (m[3]) { h = h % 12 + (/p/i.test(m[3]) ? 12 : 0); }
  return ("0" + h).slice(-2) + ":" + (m[2] || "00");
}

function yes(v) { return /^(yes|y|true|x|✓|done)$/i.test(String(v || "").trim()); }

// Plain text only, at most 5000 characters, and never read as a formula.
function clean(v) {
  let s = String(v == null ? "" : v).slice(0, 5000);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
