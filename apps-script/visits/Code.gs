/**
 * Supervisory Visits, hosted by Google (Apps Script web app inside your Google Workspace).
 *
 * Staff open the web app link and sign in with their own work Google account. Only people
 * listed in the "Staff" tab (and the owner) can open it. People with "Manager" in the Staff
 * tab's Role column (and the owner) review completed visits: a visit only counts, and the
 * client only leaves the due list, once a manager approves it. Every view and change is written to
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
    "Hold reason", "Hold since", "Ended", "Ended on", "Visit awaiting review", "Completed by", "Completed on",
    "Reviewed by", "Reviewed on", "Review note", "Inactive", "Deleted", "Client ID", "Updated"],
  toCells: function (r) {
    return {
      "First name": r.first, "Last name": r.last, "Last visit": r.lastVisit, "Next due": r.nextDue,
      "Scheduled visit": r.scheduled, "Notes": r.notes, "On hold": r.onHold ? "Yes" : "", "Hold reason": r.holdReason,
      "Hold since": r.holdSince, "Ended": r.endReason === "deceased" ? "Deceased" : r.endReason ? "Ended care" : "",
      "Ended on": r.endedOn, "Visit awaiting review": r.pendingVisit, "Completed by": r.completedBy,
      "Completed on": r.completedOn, "Reviewed by": r.reviewedBy, "Reviewed on": r.reviewedOn, "Review note": r.reviewNote,
      "Inactive": r.inactive ? "Yes" : "", "Client ID": r.id, "Updated": r.updated
    };
  },
  fromCells: function (c) {
    return {
      id: c["Client ID"], first: c["First name"], last: c["Last name"], lastVisit: c["Last visit"],
      nextDue: c["Next due"], scheduled: c["Scheduled visit"], notes: c["Notes"], onHold: yes_(c["On hold"]),
      holdReason: c["Hold reason"], holdSince: c["Hold since"], endReason: endReason_(c["Ended"]), endedOn: c["Ended on"],
      pendingVisit: c["Visit awaiting review"], completedBy: c["Completed by"], completedOn: c["Completed on"],
      reviewedBy: c["Reviewed by"], reviewedOn: c["Reviewed on"], reviewNote: c["Review note"],
      inactive: yes_(c["Inactive"]) || !!endReason_(c["Ended"]), removed: yes_(c["Deleted"]), updated: c["Updated"]
    };
  }
};
const STAFF = { name: "Staff", headers: ["Email", "Name", "Role", "Notes"] };
const AUDIT = { name: "Audit log", headers: ["Time", "User", "Action", "Client", "Client ID", "Details"] };

const DATE_HEADERS = ["Last visit", "Next due", "Scheduled visit", "Hold since", "Ended on", "Visit awaiting review",
  "Completed on", "Reviewed on"];
// Set only by completeVisit / reviewVisit (with the signed-in person's email), never by the page.
const REVIEW_FIELDS = ["pendingVisit", "completedBy", "completedOn", "reviewedBy", "reviewedOn", "reviewNote"];
const TEXT_FIELDS = ["first", "last", "lastVisit", "nextDue", "scheduled", "notes", "holdReason", "holdSince", "endReason", "endedOn"];

// ---------- The page ----------
function doGet() {
  let user;
  try { user = requireStaff_(); } catch (err) {
    // Say which account Google reports, so a mismatch (or no account at all) is easy to spot.
    const seen = String(Session.getActiveUser().getEmail() || "").trim();
    const who = seen
      ? "<p>You're signed in as <b>" + escapeHtml_(seen) + "</b>. Ask the office to add exactly this email to the Staff tab, then reload this page.</p>"
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
  const user = requireStaff_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  staffSheet_(ss); // so the Staff tab is there to fill in
  const clients = readClients_(ss).list.filter(function (r) { return r.id && !r.removed; });
  if (opened) audit_(ss, user, "Opened the list", "", "", clients.length + " clients");
  return { user: user, manager: isManager_(user), clients: clients };
}

/**
 * Saves one client (adds it if new). If someone else changed this client since the page loaded
 * it, nothing is saved and the newest copy is sent back instead.
 */
function saveClient(inc, action) {
  const user = requireStaff_();
  if (!inc || typeof inc !== "object") throw new Error("Nothing to save.");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = readClients_(ss);
    let id = String(inc.id || "");
    if (!/^[\w-]{1,80}$/.test(id)) id = "";
    const found = id ? data.byId[id] : null;
    if (found && String(inc.updated || "") < String(found.rec.updated || "")) {
      return { conflict: true, client: found.rec };
    }
    if (!id) id = "v-" + Utilities.getUuid().slice(0, 12);

    const rec = { id: id, updated: new Date().toISOString(), onHold: !!inc.onHold, inactive: !!inc.inactive || !!inc.endReason };
    TEXT_FIELDS.forEach(function (f) { rec[f] = String(inc[f] == null ? "" : inc[f]); });
    REVIEW_FIELDS.forEach(function (f) { rec[f] = found ? String(found.rec[f] || "") : ""; });
    if (!rec.first.trim() && !rec.last.trim()) throw new Error("A client needs a name.");
    // A completed visit only counts once a manager approves it, so only managers can change
    // an existing client's last visit date directly.
    if (found && rec.lastVisit !== String(found.rec.lastVisit || "") && !isManager_(user)) {
      throw new Error("Only a manager can change the last visit date. Use Mark completed, and a manager will review the visit");
    }
    const saved = writeClient_(data, found, rec);
    audit_(ss, user, String(action || (found ? "Edited client" : "Added client")).slice(0, 80), fullName(saved), id,
      found ? changes_(found.rec, saved) : "New client: " + describe_(saved));
    return { client: saved };
  } finally {
    lock.releaseLock();
  }
}

/** Marks a visit as done. It then waits for a manager's review; the due date doesn't move yet. */
function completeVisit(id, updated, date) {
  const user = requireStaff_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Error("Enter the date of the visit.");
  return changeClient_(id, updated, function (rec, tz) {
    rec.pendingVisit = date; rec.completedBy = user; rec.completedOn = todayIn_(tz); rec.scheduled = "";
    return { action: "Marked visit completed", details: "Visit on " + date + ", awaiting review" };
  });
}

/** Undoes "Mark completed" before it has been reviewed (puts the scheduled date back). */
function cancelCompletion(id, updated, scheduled) {
  requireStaff_();
  return changeClient_(id, updated, function (rec) {
    if (!rec.pendingVisit) throw new Error("There's no completed visit waiting for review.");
    const was = rec.pendingVisit;
    rec.pendingVisit = ""; rec.completedBy = ""; rec.completedOn = "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(scheduled || ""))) rec.scheduled = scheduled;
    return { action: "Undid visit completed", details: "Visit on " + was + " is no longer marked completed" };
  });
}

/**
 * A manager's review of a completed visit. Approved: it becomes the last visit and the next visit
 * is due 90 days later. Sent back: the client is due again, with the manager's note.
 */
function reviewVisit(id, updated, approve, note) {
  const user = requireStaff_();
  if (!isManager_(user)) throw new Error("Only a manager can review visits");
  note = String(note || "").trim().slice(0, 500);
  if (!approve && !note) throw new Error("Add a note saying what needs to be done");
  return changeClient_(id, updated, function (rec, tz) {
    if (!rec.pendingVisit) throw new Error("There's no completed visit waiting for review.");
    const visit = rec.pendingVisit, by = rec.completedBy;
    rec.reviewedBy = user; rec.reviewedOn = todayIn_(tz); rec.pendingVisit = "";
    if (approve) {
      rec.lastVisit = visit; rec.nextDue = nextVisit_(visit); rec.reviewNote = note;
      return { action: "Approved visit", details: "Visit on " + visit + " by " + by + " approved. Next due " + rec.nextDue + (note ? ". Note: " + note : "") };
    }
    rec.completedBy = ""; rec.completedOn = ""; rec.reviewNote = "Sent back: " + note;
    return { action: "Sent back visit", details: "Visit on " + visit + " by " + by + " sent back: " + note };
  });
}

// Reads a client, checks nobody else changed it meanwhile, applies `fn`, saves and logs it.
function changeClient_(id, updated, fn) {
  const user = requireStaff_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = readClients_(ss);
    const found = data.byId[String(id || "")];
    if (!found) throw new Error("That client wasn't found. Reload the page.");
    if (String(updated || "") < String(found.rec.updated || "")) return { conflict: true, client: found.rec };
    const rec = JSON.parse(JSON.stringify(found.rec));
    const what = fn(rec, data.tz);
    rec.updated = new Date().toISOString();
    const saved = writeClient_(data, found, rec);
    audit_(ss, user, what.action, fullName(saved), saved.id, what.details);
    return { client: saved };
  } finally {
    lock.releaseLock();
  }
}

function writeClient_(data, found, rec) {
  const cells = CLIENTS.toCells(rec);
  const headers = data.headers;
  const row = found ? data.rows[found.index] : headers.map(function () { return ""; });
  headers.forEach(function (h, j) { if (h in cells) row[j] = clean_(cells[h], h); });
  const range = found ? data.sheet.getRange(found.index + 2, 1, 1, headers.length)
    : data.sheet.getRange(data.sheet.getLastRow() + 1, 1, 1, headers.length);
  range.setNumberFormat("@").setValues([row]);
  return CLIENTS.fromCells(rowCells_(headers, row, data.tz));
}

const fullName = r => (String(r.first || "") + " " + String(r.last || "")).trim();
function todayIn_(tz) { return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd"); }

/** Records something done on the page that doesn't change data (e.g. copying the due list). */
function logEvent(action, details) {
  const user = requireStaff_();
  audit_(SpreadsheetApp.getActiveSpreadsheet(), user, String(action || "").slice(0, 80), "", "", String(details || "").slice(0, 500));
  return true;
}

// ---------- Who can use it ----------
/** The signed-in person's email, if they're the owner or listed in the Staff tab. */
function requireStaff_() {
  const email = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  if (!email) throw new Error("Not signed in.");
  if (ownerEmails_().indexOf(email) >= 0) return email;
  if (staffList_().some(function (p) { return p.email === email; })) return email;
  throw new Error("No access.");
}

/** Managers review completed visits: the owner, and anyone with "Manager" in the Staff tab's Role column. */
function isManager_(email) {
  email = String(email || "").toLowerCase();
  if (ownerEmails_().indexOf(email) >= 0) return true;
  return staffList_().some(function (p) { return p.email === email && p.manager; });
}

// The person the script runs as, and the owner of the spreadsheet, always have access.
function ownerEmails_() {
  const out = [];
  try { out.push(Session.getEffectiveUser().getEmail()); } catch (e) { /* not available */ }
  try { const o = SpreadsheetApp.getActiveSpreadsheet().getOwner(); if (o) out.push(o.getEmail()); } catch (e) { /* not available */ }
  return out.map(function (x) { return String(x || "").trim().toLowerCase(); }).filter(String);
}

// The Staff tab (found even if its name has different capitals or extra spaces).
function staffSheet_(ss) {
  const found = ss.getSheets().filter(function (sh) { return sh.getName().trim().toLowerCase() === STAFF.name.toLowerCase(); })[0];
  return found || tab_(ss, STAFF);
}

/**
 * Everyone in the Staff tab: the email(s) in column A of each row, and whether its Role column
 * says Manager. Emails are picked out of whatever is in the cell, so a person chip, a mailto:
 * link, a name with the email, or stray spaces all still work.
 */
function staffList_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("This script isn't attached to a spreadsheet.");
  const sheet = staffSheet_(ss);
  const last = sheet.getLastRow(), width = Math.max(1, sheet.getLastColumn());
  if (!last) return [];
  const all = sheet.getRange(1, 1, last, width).getValues();
  const roleCol = all[0].map(function (h) { return String(h).trim().toLowerCase(); }).indexOf("role");
  const range = sheet.getRange(1, 1, last, 1);
  const values = range.getValues(), shown = range.getDisplayValues();
  let links = [];
  try { links = range.getRichTextValues(); } catch (e) { /* not available */ }
  const out = [];
  for (let i = 0; i < last; i++) {
    const texts = [String(values[i][0] || ""), String(shown[i][0] || "")];
    try { const rt = links[i] && links[i][0]; if (rt && rt.getLinkUrl()) texts.push(rt.getLinkUrl()); } catch (e) { /* no link */ }
    const manager = roleCol >= 0 && /manager|admin|supervisor/i.test(String(all[i][roleCol] || ""));
    texts.join(" ").replace(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, function (m) { out.push({ email: m.toLowerCase(), manager: manager }); return m; });
  }
  return out;
}
function staffEmails_() { return staffList_().map(function (p) { return p.email; }); }

/**
 * Run this from the Apps Script editor (choose "checkSetup" next to Run, then click Run) and
 * look at the Execution log. It shows which spreadsheet the script is attached to and what it
 * reads from the Staff tab. Nothing is changed.
 */
function checkSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) { console.log("PROBLEM: this script is not attached to a spreadsheet. Open Apps Script from the sheet (Extensions → Apps Script)."); return; }
  console.log("Attached to spreadsheet: " + ss.getName() + " — " + ss.getUrl());
  console.log("Tabs: " + ss.getSheets().map(function (sh) { return '"' + sh.getName() + '"'; }).join(", "));
  console.log("Always allowed (script runs as / sheet owner): " + (ownerEmails_().join(", ") || "(none found)"));
  const people = staffList_();
  console.log("Emails found in the Staff tab: " + (people.map(function (p) { return p.email + (p.manager ? " (manager)" : ""); }).join(", ") || "(none)"));
}

// ---------- Audit log ----------
function audit_(ss, user, action, client, id, details) {
  const sheet = tab_(ss, AUDIT);
  sheet.appendRow([new Date(), user, clean_(action), clean_(client), clean_(id), clean_(details)]);
}

const LABELS = {
  first: "First name", last: "Last name", lastVisit: "Last visit", nextDue: "Next due", scheduled: "Scheduled visit",
  notes: "Notes", onHold: "On hold", holdReason: "Hold reason", endReason: "Ended", endedOn: "Ended on",
  pendingVisit: "Visit awaiting review"
};
function show_(k, v) {
  if (k === "onHold") return v ? "Yes" : "No";
  if (k === "endReason") return v === "deceased" ? "Deceased" : v ? "Ended care" : "—";
  return v === "" || v == null ? "—" : String(v);
}
function changes_(a, b) {
  const out = [];
  Object.keys(LABELS).forEach(function (k) {
    const x = k === "onHold" ? !!a[k] : String(a[k] || ""), y = k === "onHold" ? !!b[k] : String(b[k] || "");
    if (x !== y) out.push(LABELS[k] + ": " + show_(k, x) + " → " + show_(k, y));
  });
  return out.join("; ") || "No changes";
}
function describe_(r) {
  return ["lastVisit", "nextDue", "scheduled"].filter(function (k) { return r[k]; })
    .map(function (k) { return LABELS[k] + " " + r[k]; }).join("; ");
}

// ---------- Reading the Clients tab ----------
function readClients_(ss) {
  const sheet = tab_(ss, CLIENTS);
  const tz = ss.getSpreadsheetTimeZone();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
  const byId = {};
  const list = rows.map(function (row, i) {
    const rec = CLIENTS.fromCells(rowCells_(headers, row, tz));
    if (!rec.nextDue && rec.lastVisit) rec.nextDue = nextVisit_(rec.lastVisit); // row typed in by hand
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
      const due = nextVisit_(cellText_(values[lastCol - 1], "Last visit", tz));
      if (due) sheet.getRange(row, dueCol).setNumberFormat("@").setValue(due);
    }
  }
}

// ---------- helpers ----------
// 90 days after a "yyyy-MM-dd" date; Saturday moves to the Friday before, Sunday to the Monday after.
function nextVisit_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + INTERVAL_DAYS));
  const w = d.getUTCDay();
  if (w === 6) d.setUTCDate(d.getUTCDate() - 1);
  if (w === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// "Ended" column: "Deceased" or "Ended care" (other wording typed by hand is understood too).
function endReason_(v) {
  const s = String(v || "");
  return /deceas|died|passed/i.test(s) ? "deceased" : /end|discharg/i.test(s) ? "ended" : "";
}

function tab_(ss, spec) {
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

function rowCells_(headers, row, tz) {
  const c = {};
  headers.forEach(function (h, j) { c[h] = cellText_(row[j], h, tz); });
  return c;
}

function cellText_(v, header, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, DATE_HEADERS.indexOf(header) >= 0 ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm:ss");
  if (v === true) return "Yes";
  if (v === false) return "";
  let s = String(v == null ? "" : v).trim();
  if (/^'[=+\-@]/.test(s)) s = s.slice(1); // undo the formula guard from clean_()
  if (DATE_HEADERS.indexOf(header) >= 0) s = normDate_(s);
  return s;
}

// Dates typed by hand, e.g. 11/8/2026, become 2026-11-08.
function normDate_(s) {
  if (!s || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!m) return s;
  const y = m[3].length === 2 ? "20" + m[3] : m[3];
  return y + "-" + ("0" + m[1]).slice(-2) + "-" + ("0" + m[2]).slice(-2);
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
}

function yes_(v) { return /^(yes|y|true|x|✓)$/i.test(String(v || "").trim()); }

// Plain text only, at most 2000 characters, and never read as a formula.
function clean_(v, header) {
  let s = String(v == null ? "" : v).slice(0, 2000);
  if (header && DATE_HEADERS.indexOf(header) >= 0 && s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) s = "";
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
