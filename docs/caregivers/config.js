// Settings for the Caregiver Compliance page. See README.md.
window.CAREGIVERS_CONFIG = {
  // The Apps Script web app URL (ends in /exec) for the private Google Sheet that holds the
  // caregiver list. Leave empty and the page asks for it on each computer instead.
  // Setup: apps-script/README.md ("Caregiver compliance sheet").
  sheetUrl: "",

  // Show licenses and insurances that have expired or expire within this many days.
  expiringDays: 10,

  // Show annual training that is overdue or due within this many days.
  trainingDays: 30,

  // Annual training is due this many months after the hire date, then this many months after
  // each previous due date. A due date on a Saturday moves to Friday, on a Sunday to Monday.
  trainingMonths: 11,

  // "Copy message" text. {first} = first name, {item} = driver's license / car insurance,
  // {date} = MM/DD, {when} = "is expiring soon on" or "expired on".
  message: "Hi {first}! It looks like your {item} {when} {date}. Can you please send us your updated {item}? We need to have it to continue to assign shifts. Thank you!"
};
