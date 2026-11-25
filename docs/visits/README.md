# Supervisory Visits (moved)

The Supervisory Visits page now runs inside the agency's Google Workspace, where staff sign in
with their own work Google account. Its code is in `apps-script/visits/` and the setup steps
are in `apps-script/README.md` ("Supervisory visits (Google-hosted)").

This folder only holds a short "this page has moved" notice. Opening it also erases the copy
of the client list the old version of the page kept in the browser. No client data is stored
in this repository.

## How the page works

- **Visits due**: overdue, due in the next 3 weeks, or with a visit scheduled in the next 3
  weeks. **Copy list** and **Print** are recorded in the audit log.
- **Enter scheduled date**, **Mark completed** (next visit due 90 days after the visit, moved
  to the closest weekday: Saturday → Friday, Sunday → Monday), and a status dropdown:
  **Active**, **On hold** (off the due list, with a reason), **Ended care** / **Deceased**
  (off every list, record kept with the date).
- **+ Add client** with the first visit (start) date; the first supervisory visit is due 90 days after it.
- Every change has an Undo, and is saved to the sheet and the audit log straight away.
- **Mark completed** moves the visit to **Awaiting review** (it's no longer under Visits due). A
  manager approves it (the next visit is then due 90 days after it) or sends it back, which puts
  the client back on the due list.
