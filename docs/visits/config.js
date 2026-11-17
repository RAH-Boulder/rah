// Settings for the Supervisory Visits page. See README.md.
window.VISITS_CONFIG = {
  // The Apps Script web app URL (ends in /exec) for the private Google Sheet that holds the
  // client list. Leave empty and the page asks for it on each computer instead.
  // Setup: apps-script/README.md ("Supervisory visits sheet").
  sheetUrl: "",

  // The next visit is due this many days after the last completed visit. If that lands on a
  // Saturday it moves to the Friday before; a Sunday moves to the Monday after.
  intervalDays: 90,

  // "Due soon" lists visits that are overdue or due within this many days.
  dueSoonDays: 14
};
