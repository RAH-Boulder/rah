# Supervisory Visits

One page that tracks when each client's **90-day supervisory visit** is due. No server, no
build step. Every time the page is opened (or you come back to the tab, or the date rolls
over at midnight) it re-checks today's date.

- **Visits due**: anyone overdue, due in the next 14 days, or with a visit scheduled in the
  next 14 days. Each row shows the due date, the last visit, and whether a visit is
  scheduled. **Copy list** copies the list as text for an email or message; **Print** prints it.
- **Enter scheduled date** records when the visit is booked (you can change or clear it).
  The page warns if the date is after the due date or on a weekend.
- **Mark completed** records the date the visit took place, works out the next due date,
  and clears the scheduled date. Every action can be undone from the message that appears.
- **All clients**: the full list, searchable and sortable. Click a row to edit.

## Due dates

- Next visit due = date of the last completed visit + 90 days.
- If that lands on a Saturday it moves to the Friday before; a Sunday moves to the Monday after.
- The count starts from the date the visit was actually done (not the old due date).
- A due date can be changed by hand by opening the client.

## Adding a client

Click **+ Add client** and enter the name and the **first visit date**:

- If the first visit has already happened, the next visit is due 90 days later.
- If it's in the future, it's listed as a scheduled first visit. Click **Mark completed**
  after it happens to start the 90-day count.

Tick **Inactive** (open the client) for someone who is no longer a client: their record
stays but they drop off the lists. **Delete** removes them completely.

## Where the data is kept

This repository is public, so **no client data is stored in it**. The list lives in:

1. **A private Google Sheet** (recommended), so every computer shows the same list.
   Setup: `apps-script/README.md` ("Supervisory visits sheet"). Then on each computer,
   scroll to **Google Sheet**, paste the web app URL and passcode, and click **Connect**.
   (Put the URL in `config.js` as `sheetUrl` to skip pasting it.)
2. **This browser**: everything is saved on the computer too, so the page works offline.
   Without the sheet, each computer/browser has its own separate list.

On a shared computer, **Forget this computer** (in the Google Sheet box) erases the list and
the passcode from that browser; the sheet keeps everything.

**Download CSV** saves the whole list (a good backup). **Import CSV** loads one: clients are
matched by name and their dates updated; new names are added. Columns: First name, Last
name, Last visit, Next due, Scheduled visit, Notes (the old spreadsheet's "Last Supervisory
Visit" and "Due Date for Next Visit" headings work too). A blank Next due is worked out from
the last visit. A last visit date in the future is treated as a scheduled first visit.

## Settings (`config.js`)

- `intervalDays` — days between visits (90).
- `dueSoonDays` — how far ahead the "Visits due" list looks (14).
- `sheetUrl` — the Google Sheet web app URL.

After changing a file, bump the `?v=` numbers in `index.html` so browsers pick up the
new version.
