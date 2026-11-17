# Caregiver Compliance

One page that tracks, for every caregiver, when their **driver's license** and **car
insurance** expire and when their **annual training** is due. No server, no build step.

Every time the page is opened (or you come back to the tab, or the date rolls over at
midnight) it re-checks today's date and shows:

- **Car insurance** and **Driver's license** (two separate lists): anything already expired, or expiring in the
  next 10 days. **Enter new expiration date** saves the new one; **Copy message** copies a ready-to-send text
  ("Hi Doreena! It looks like your car insurance is expiring soon on 11/20…").
- **Annual training due**: anyone overdue, or due in the next 30 days. **Mark completed**
  records the date and sets the next due date.
- **Missing dates**: active caregivers with no hire date, license or insurance date.
- **All caregivers**: the full list, searchable and sortable. Click a row to edit.

## Annual training dates

- First due date = hire date + 11 months.
- After it's marked completed, next due date = the last **due date** + 11 months (not the
  date it was actually done).
- If that lands on a Saturday it moves to the Friday before; a Sunday moves to the Monday
  after. (Same as the old spreadsheet formula.)
- Months work like Excel's EDATE: Jan 31 + 1 month = Feb 28.
- When adding someone, the training due date fills itself in from the hire date. You can
  type a different due date if you need to.

## Adding a caregiver

Click **+ Add caregiver** and enter the name, hire date, license and insurance expiration
dates. Tick **Inactive** for someone who has left: their record stays but they drop off the
lists. **Delete** removes them completely.

## Where the data is kept

This repository is public, so **no caregiver data is stored in it**. The list lives in:

1. **A private Google Sheet** (recommended), so every computer shows the same list.
   Setup: `apps-script/README.md` ("Caregiver compliance sheet"). Then on each computer,
   scroll to **Google Sheet**, paste the web app URL and passcode, and click **Connect**.
   (Put the URL in `config.js` as `sheetUrl` to skip pasting it.)
2. **This browser**: everything is saved on the computer too, so the page works offline.
   Without the sheet, each computer/browser has its own separate list.

**Download CSV** saves the whole list as a spreadsheet (a good backup).
**Import CSV** loads one: caregivers are matched by name and their dates updated; new
names are added. Columns: First name, Last name, Hire date, License expires,
Insurance expires, Training due, Last training, Notes.

## Settings (`config.js`)

- `expiringDays` — how far ahead to warn about licenses/insurance (10).
- `trainingDays` — how far ahead to list annual training (30).
- `trainingMonths` — months between trainings (11).
- `message` — the "Copy message" text.

After changing a file, bump the `?v=` numbers in `index.html` so browsers pick up the
new version.
