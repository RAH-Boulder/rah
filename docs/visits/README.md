# Supervisory Visits

One page that tracks when each client's **90-day supervisory visit** is due. No server, no
build step. Every time the page is opened (or you come back to the tab, or the date rolls
over at midnight) it re-checks today's date.

- **Visits due**: anyone overdue, due in the next 3 weeks (21 days), or with a visit scheduled in the
  next 3 weeks. Each row shows the due date, the last visit, and whether a visit is
  scheduled. **Copy list** copies the list as text for an email or message; **Print** prints it.
- **Enter scheduled date** records when the visit is booked (you can change or clear it).
  The page warns if the date is after the due date or on a weekend.
- **Mark completed** records the date the visit took place, works out the next due date,
  and clears the scheduled date. Every action can be undone from the message that appears.
- **Status dropdown** (on the due list, the On hold list, All clients, and when editing):
  - **On hold**: still a client but not visited for now, e.g. temporary nursing home care.
    They drop off the due list and counts and appear under **On hold** with the reason.
  - **Ended care** / **Deceased**: no longer a client. They drop off every list, and their
    record is kept with the date (tick **Show ended care & deceased** to see them).
  - **Active**: back on the lists; if their visit is past due they show as overdue.
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

Set the status to **Ended care** or **Deceased** to keep a former client's record but take
them off the lists automatically. There's no separate remove button.

## Where the data is kept

This repository is public, so **no client data is stored in it**. The list lives in a private
Google Sheet (setup: `apps-script/README.md`, "Supervisory visits sheet"), and its web app
address is set in `config.js` as `sheetUrl`.

**The page is locked until a computer connects.** Until the team passcode has been entered
and checked by the sheet, the page shows only the passcode box: no client names, counts or
buttons. Once connected, the browser keeps a copy so the page also works briefly offline.

- **Disconnect this computer** (next to Sync now) erases the list and the passcode from
  that browser.
- If the passcode is changed in the sheet's script, every connected browser locks itself and
  erases its copy the next time it opens; staff then enter the new passcode.

There are no download or import buttons, so client data only goes in through **+ Add client**
and the page's buttons, or by editing the Google Sheet directly. The sheet, with its version
history, is the backup.

## Settings (`config.js`)

- `intervalDays` — days between visits (90).
- `dueSoonDays` — how far ahead the "Visits due" list looks (21 days = 3 weeks).
- `sheetUrl` — the Google Sheet web app URL.

After changing a file, bump the `?v=` numbers in `index.html` so browsers pick up the
new version.
