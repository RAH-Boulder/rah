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

// ---------- Moving to a new sheet ----------
// Adds a "Referral partners" menu to the sheet (runs by itself when the sheet opens).
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Referral partners")
    .addItem("Copy data from old sheet…", "copyFromOldSheet")
    .addToUi();
}

/**
 * Copies the Visits and Partners tabs from an older referral partners sheet into this one.
 * The old sheet is only read, never changed. Rows are matched by their ID and the newest
 * copy (by "Updated") is kept, so running it twice never doubles anything. Old rows typed in
 * without an ID get one made from their contents, so they also match up on a second run.
 */
function copyFromOldSheet() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.prompt("Copy data from old sheet",
    "Paste the link to the OLD referral partners Google Sheet (copy it from the address bar). " +
    "Its Visits and Partners tabs are copied into this sheet. The old sheet isn't changed, and it's safe to run this again.",
    ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  const text = answer.getResponseText().trim();
  const m = text.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || text.match(/^([a-zA-Z0-9_-]{20,})$/);
  if (!m) { ui.alert("That doesn't look like a Google Sheets link. Open the old sheet and copy the whole address from the address bar."); return; }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (m[1] === ss.getId()) { ui.alert("That's the link to this sheet. Paste the OLD sheet's link instead."); return; }
  let old;
  try { old = SpreadsheetApp.openById(m[1]); }
  catch (err) { ui.alert("Couldn't open that sheet. Check the link, and that you can open the old sheet with this Google account."); return; }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const lines = [PARTNERS, VISITS].map(function (spec) {
      const r = copyTab(old, ss, spec);
      if (!r) return spec.name + ": the old sheet has no " + spec.name + " tab, so nothing to copy.";
      return spec.name + ": " + r.added + " copied, " + r.updated + " updated, " + r.same + " already here (" + r.total + " in the old sheet).";
    });
    ui.alert("Done", lines.join("\n") + "\n\nThe old sheet wasn't changed.", ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}

function copyTab(oldSs, ss, spec) {
  const src = oldSs.getSheetByName(spec.name);
  if (!src || src.getLastRow() < 1 || src.getLastColumn() < 1) return null;
  const srcHeaders = src.getRange(1, 1, 1, src.getLastColumn()).getDisplayValues()[0].map(String);
  const srcRows = src.getLastRow() > 1 ? src.getRange(2, 1, src.getLastRow() - 1, srcHeaders.length).getDisplayValues() : [];
  const sIdCol = srcHeaders.indexOf(spec.id), sUpdCol = srcHeaders.indexOf("Updated");

  // The newest copy of each old row, by ID. Rows without an ID get one.
  const newest = {}, order = [];
  srcRows.forEach(function (row) {
    if (row.every(function (v) { return v === ""; })) return;
    let id = sIdCol >= 0 ? row[sIdCol] : "";
    if (!id) id = (spec === VISITS ? "v-" : "p-") + rowFingerprint(row); // same row, same ID, every run
    const upd = sUpdCol >= 0 ? row[sUpdCol] : "";
    if (!(id in newest)) order.push(id);
    else if (!(String(upd) > String(newest[id].upd))) return;
    newest[id] = { row: row, upd: upd };
  });

  const sheet = tab(ss, spec);
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  // Keep any columns you added yourself in the old sheet.
  const extra = srcHeaders.filter(function (h) { return h && headers.indexOf(h) < 0; });
  if (extra.length) {
    sheet.getRange(1, headers.length + 1, 1, extra.length).setValues([extra]).setFontWeight("bold");
    headers = headers.concat(extra);
  }
  const width = headers.length, lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getDisplayValues() : [];
  const idCol = headers.indexOf(spec.id), updCol = headers.indexOf("Updated");
  const deletedCol = headers.indexOf(spec === VISITS ? "Deleted" : "Removed");
  const here = {};
  rows.forEach(function (r, i) { if (r[idCol]) here[r[idCol]] = i; });

  const added = [], changed = {};
  let same = 0;
  order.forEach(function (id) {
    const item = newest[id], i = here[id];
    if (i !== undefined && !(String(item.upd) > String(rows[i][updCol] || ""))) { same++; return; }
    const row = i !== undefined ? rows[i].slice() : headers.map(function () { return ""; });
    srcHeaders.forEach(function (h, j) { const k = headers.indexOf(h); if (h && k >= 0) row[k] = clean(item.row[j]); });
    row[idCol] = id;
    if (i !== undefined) { rows[i] = row; changed[i] = true; } else added.push(row);
  });

  Object.keys(changed).forEach(function (k) {
    const i = Number(k), range = sheet.getRange(i + 2, 1, 1, width);
    range.setNumberFormat("@").setValues([rows[i]]);
    if (deletedCol >= 0 && yes(rows[i][deletedCol])) range.setFontColor("#9aa0a6");
  });
  if (added.length) {
    sheet.getRange(lastRow + 1, 1, added.length, width).setNumberFormat("@").setValues(added);
    added.forEach(function (row, n) {
      if (deletedCol >= 0 && yes(row[deletedCol])) sheet.getRange(lastRow + 1 + n, 1, 1, width).setFontColor("#9aa0a6");
    });
  }
  return { added: added.length, updated: Object.keys(changed).length, same: same, total: order.length };
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

// A short ID made from a row's contents, for old rows that never got an ID.
function rowFingerprint(row) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, row.join("\u0001"), Utilities.Charset.UTF_8);
  return bytes.slice(0, 6).map(function (b) { return ("0" + (b & 255).toString(16)).slice(-2); }).join("");
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
