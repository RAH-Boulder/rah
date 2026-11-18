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
- **Put on hold** (on the due list, or tick **On hold** when editing a client) for someone
  who stays a client but shouldn't be visited for now, e.g. temporary nursing home care.
  They drop off the due list and counts and appear under **On hold** with the reason.
  **Take off hold** puts them back; if their visit is past due they show as overdue.
- **All clients**: the full list, searchable and sortable. Click a row to edit.
  **Remove** takes a client off the list completely (you're asked to confirm, and can undo).

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

Tick **Inactive** (open the client) to keep a former client's record but hide them.
**Remove** deletes them from the list completely.

## Where the data is kept

This repository is public, so **no client data is stored in it**. The list lives in a private
Google Sheet (setup: `apps-script/README.md`, "Supervisory visits sheet"), and its web app
address is set in `config.js` as `sheetUrl`.

**The page is locked until a computer connects.** Until the team passcode has been entered
and checked by the sheet, the page shows only the passcode box: no client names, counts or
buttons. Once connected, the browser keeps a copy so the page also works briefly offline.

- **Disconnect this computer** (bottom of the page) erases the list and the passcode from
  that browser. Use it on shared computers.
- If the passcode is changed in the sheet's script, every connected browser locks itself and
  erases its copy the next time it opens; staff then enter the new passcode.

**Download CSV** saves the whole list (a good backup). **Import CSV** loads one: clients are
matched by name and their dates updated; new names are added. Columns: First name, Last
name, Last visit, Next due, Scheduled visit, Notes (the old spreadsheet's "Last Supervisory
Visit" and "Due Date for Next Visit" headings work too). A blank Next due is worked out from
the last visit. A last visit date in the future with no Next due is treated as a scheduled first visit.

## Settings (`config.js`)

- `intervalDays` — days between visits (90).
- `dueSoonDays` — how far ahead the "Visits due" list looks (21 days = 3 weeks).
- `sheetUrl` — the Google Sheet web app URL.

After changing a file, bump the `?v=` numbers in `index.html` so browsers pick up the
new version.
