/**
 * Adds one row to this Google Sheet for every caregiver who completes the
 * training on the carer-training site (docs/carer-training).
 *
 * Setup: see apps-script/README.md. In short: open the Google Sheet,
 * Extensions > Apps Script, paste this file, then Deploy > New deployment >
 * Web app (Execute as: Me, Who has access: Anyone), and put the /exec URL in
 * docs/carer-training/config.js as sheetUrl.
 *
 * Safety: the script can only add rows to the "Completions" tab of this one
 * spreadsheet. It never returns any data, so nobody can read the sheet through it.
 */

const SHEET_NAME = "Completions";
const COLUMNS = ["Received", "First name", "Last name", "Email", "Quiz score",
  "Date signed", "Signature", "Record ID", "Training", "Video watched"];

// At most this many rows per hour, so a flood of fake submissions can't fill the sheet.
const MAX_ROWS_PER_HOUR = 60;

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const row = [
      new Date(),
      clean(data.first), clean(data.last), clean(data.email), clean(data.score),
      clean(data.dateSigned), clean(data.signature), clean(data.recordId), clean(data.training),
      clean(data.videoWatched)
    ];
    if (!row[1] || !row[2]) return reply({ ok: false, error: "missing name" });

    const cache = CacheService.getScriptCache();
    const count = Number(cache.get("rows-this-hour") || 0);
    if (count >= MAX_ROWS_PER_HOUR) return reply({ ok: false, error: "too many" });
    cache.put("rows-this-hour", String(count + 1), 3600);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet().appendRow(row);
    } finally {
      lock.releaseLock();
    }
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: "could not save" });
  }
}

// The "Completions" tab, created with a header row the first time. If the
// tab was made by an older version with fewer columns, the header is extended.
function sheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let tab = book.getSheetByName(SHEET_NAME);
  if (!tab) {
    tab = book.insertSheet(SHEET_NAME);
    tab.appendRow(COLUMNS);
    tab.setFrozenRows(1);
  } else if (tab.getRange(1, COLUMNS.length).getValue() !== COLUMNS[COLUMNS.length - 1]) {
    tab.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
  }
  tab.getRange(1, 1, 1, COLUMNS.length).setFontWeight("bold");
  return tab;
}

// Plain text only, at most 200 characters. A leading = + - or @ would make
// Sheets treat the value as a formula, so it gets a ' in front.
function clean(value) {
  let text = String(value == null ? "" : value).replace(/[\r\n\t]+/g, " ").trim().slice(0, 200);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
