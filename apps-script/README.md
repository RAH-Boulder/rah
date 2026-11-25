# Completions sheet

`CompletionsSheet.gs` is a small Google Apps Script. When a caregiver signs the
form on the carer-training site, the site sends the completion details here and
the script adds a row to the **Completions** tab of a Google Sheet:

Received · First name · Last name · Email · Quiz score · Date signed · Signature · Record ID · Training · Video watched

## Set it up (once, about 5 minutes)

1. In Google Sheets, create a new spreadsheet, e.g. "Caregiver Training Completions".
2. In that sheet, click **Extensions → Apps Script**.
3. Delete everything in the editor, paste in all of `CompletionsSheet.gs`, and click
   the save icon.
4. Click **Deploy → New deployment**. Click the gear next to "Select type" and
   choose **Web app**. Set **Execute as: Me** and **Who has access: Anyone**.
5. Click **Deploy**, then **Authorize access**, and allow it. (If Google warns the
   app isn't verified, click **Advanced → Go to … (unsafe)** — it's your own script.)
6. Copy the **Web app URL** (it ends in `/exec`) and put it in
   `docs/carer-training/config.js` as `sheetUrl`.

The **Completions** tab and its header row are created with the first completion.

## If you change the script later

Use **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**
to keep the same URL.

## What it can and can't do

- It can only add rows to the Completions tab of this one spreadsheet. It can't
  read, change or delete anything, and it never sends any data back.
- "Who has access: Anyone" means someone who found the URL could add fake rows.
  To limit that, it accepts at most 60 rows an hour, keeps each value to plain text
  of 200 characters, and stops values from being read as formulas.
- The completion emails (with the signed PDF) are still the official record; if a
  row looks wrong, check it against the email.

---

# Referral partners sheet

`PartnersSheet.gs` syncs the Referral Partners site (`docs/partners`) with a Google Sheet.
Every phone or computer you connect sends its visits and partner notes to the sheet and gets
everyone else's back. The sheet gets two tabs (created on the first sync):

- **Visits** — Date · Time · Partner · City · Type · Saw · Notes · Follow-up date · Follow-up · Follow-up done · Deleted · Visit ID · Partner ID · Created · Updated
- **Partners** — Name · Address · City · State · Zip · Notes · Removed · Partner ID · Updated

## Set it up (once, about 5 minutes)

1. Open the Google Sheet for referral partner visits. Keep it private: **Share → General
   access → Restricted**, and add teammates by email. The site doesn't need link sharing.
2. Click **Extensions → Apps Script**.
3. Delete everything in the editor, paste in all of `PartnersSheet.gs`, and click the save icon.
4. Choose a passcode (something long you don't use elsewhere). Click the gear
   (**Project Settings**) on the left, scroll to **Script properties**, click
   **Add script property**, and enter Property `PASSCODE`, Value: your passcode. Save.
5. Click **Deploy → New deployment**. Click the gear next to "Select type" and choose
   **Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Click **Deploy**,
   then **Authorize access** and allow it. (If Google warns the app isn't verified, click
   **Advanced → Go to … (unsafe)** — it's your own script.)
6. Copy the **Web app URL** (ends in `/exec`) and put it in `docs/partners/config.js`
   as `sheetUrl` — or paste it on the site under **Visits → Google Sheet** on each device.
7. On each phone or computer: open the site, go to **Visits → Google Sheet**, enter the
   passcode and tap **Connect**. The first sync fills the Partners tab with your list.

## Moving to a new sheet

1. Set up the new sheet with the steps above (paste `PartnersSheet.gs`, add `PASSCODE`, deploy).
   Using the same passcode as before means devices reconnect without asking.
2. Reload the new sheet. A **Referral partners** menu appears at the top. Click
   **Referral partners → Copy data from old sheet…**, paste the old sheet's link, and click
   **OK**. The first time, Google asks you to allow the script to read your sheets; allow it.
3. It copies the old **Visits** and **Partners** tabs (including deleted rows and any columns
   you added) and tells you how many rows it copied. The old sheet isn't changed. Rows are
   matched by ID, so running it again only adds what's new, never duplicates.
4. Put the new web app URL in `docs/partners/config.js` as `sheetUrl`. Each device then sends
   anything it has that wasn't in the old sheet.
5. A day later, run the copy once more to catch any last changes made to the old sheet, then
   turn the old script off: in the old sheet, **Extensions → Apps Script → Deploy → Manage
   deployments → Archive**. Keep the old sheet as a backup.

## Editing in the sheet

You can edit cells or add rows in the sheet. The script fills in **Updated** (and an ID
for new rows) so your change syncs to the site the next time it opens. Dates are
`2026-11-08` and times `14:30` (other common formats are understood too).

- To delete a visit, put `Yes` in **Deleted** rather than deleting the row; to remove a
  partner, put `Yes` in **Removed**. Rows deleted outright would come back from devices
  that still have them.
- Deleted/removed rows turn grey. You can sort or filter the tabs however you like, and add
  your own columns.

## If you change the script later

Use **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**
to keep the same URL.

## What it can and can't do

- Without the passcode it does nothing and returns nothing. After 10 wrong tries it locks
  for 15 minutes. The passcode is kept only in the script's properties and on your
  connected devices — never in the website's code, and never in backup files.
- Anyone with the passcode and the URL can read and change the visit data, so treat the
  passcode like a password. To change it, edit the `PASSCODE` property; devices will
  ask for the new one.
- If two devices edit the same visit before syncing, the most recent edit wins.

---

# Caregiver compliance sheet

`CaregiversSheet.gs` syncs the Caregiver Compliance page (`docs/caregivers`) with a private
Google Sheet, so every computer shows the same caregiver list. It creates one tab,
**Caregivers** (on the first sync):

First name · Last name · Hire date · License expires · Insurance expires · Training due ·
Last training · Notes · Inactive · Deleted · Caregiver ID · Updated

## Set it up (once, about 5 minutes)

1. Create a new Google Sheet, e.g. "Caregiver Compliance". Keep it private: **Share →
   General access → Restricted**, and add teammates by email.
2. Click **Extensions → Apps Script**.
3. Delete everything in the editor, paste in all of `CaregiversSheet.gs`, and click save.
4. Choose a passcode (at least 12 characters, not used elsewhere). Click the gear (**Project Settings**),
   scroll to **Script properties**, **Add script property**: Property `PASSCODE`, Value:
   your passcode. Save.
5. **Deploy → New deployment** → gear next to "Select type" → **Web app**. **Execute as:
   Me**, **Who has access: Anyone**. **Deploy**, then **Authorize access** and allow it. (If
   Google says the app isn't verified: **Advanced → Go to … (unsafe)** — it's your script.)
6. Copy the **Web app URL** (ends in `/exec`). Either put it in
   `docs/caregivers/config.js` as `sheetUrl`, or paste it on the page under **Google Sheet**.
7. Open the page, enter the URL and passcode under **Google Sheet**, click **Connect**.
   Other computers only need step 7.

## Editing in the sheet

You can edit cells or add rows directly. The script fills in **Updated** (and an ID for new
rows) so your change shows on the page next time it opens. Dates are `2026-11-17`
(`11/17/2026` typed by hand is understood too). The sheet does **not** work out training
due dates — fill in **Training due** yourself for rows added in the sheet, or add new
caregivers on the page instead. To delete someone put `Yes` in **Deleted** (deleting the
row outright would bring it back from computers that still have it).

## If you change the script later

**Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy** keeps the
same URL.

## What it can and can't do

- Without the passcode it does nothing and returns nothing. Each wrong try is slowed down
  (2 seconds, or 5 once there have been many), but the right passcode always works, so
  nobody can lock you out by guessing. The passcode is kept only in the script's properties
  and in the browsers you connect — never in the website's code.
- Use a passcode of at least 12 characters, e.g. four unrelated words. The page shows a
  warning if it's shorter.
- A connected browser stays unlocked: anyone who opens the page on that computer can see
  and change the list, so only connect your own work computers.
- If something is changed or deleted by mistake, **File → Version history** in the sheet
  can restore an earlier copy.
- Anyone with both the passcode and the URL can read and change the list, so treat the
  passcode like a password. To change it, edit the `PASSCODE` property.
- If two computers edit the same caregiver before syncing, the most recent edit wins.

---

# Supervisory visits (Google-hosted)

The Supervisory Visits page runs **inside your Google Workspace** as an Apps Script web app
attached to the "Supervisory Visits" Google Sheet. Files: `apps-script/visits/Code.gs` and
`apps-script/visits/Index.html`. (The old page in `docs/visits` now only says it has moved and
erases the copy the old version kept in browsers.)

- Staff sign in with **their own work Google account**; there is no shared passcode.
- Only the sheet's owner and people listed in the **Staff** tab can open it. Anyone else in
  your organization sees "You don't have access", and people outside it can't open it at all.
- Every view and change is written to the **Audit log** tab: time, who, what, which client,
  and the before → after values.
- **Management review:** **Mark completed** moves a visit to **Awaiting review** (and off the
  Visits due list). A manager (the sheet's owner, or anyone with `Manager` in the Staff tab's
  **Role** column) then **Approves** it, which makes it the last visit and sets the next due
  date, or **Sends it back** with a note, which puts the client back on the due list as not
  done. Only managers can approve, or change a last visit date directly; the script enforces
  this, not just the page.
- The client list is read live from the **Clients** tab and saved there straight away. Nothing
  about clients is stored on staff computers. If two people change the same client at once,
  the second is told and shown the latest details instead of overwriting.
- Everything stays in Google Workspace (covered by your BAA); GitHub is not involved.

Tabs: **Clients** (First name · Last name · Last visit · Next due · Scheduled visit · Notes ·
On hold · Hold reason · Hold since · Ended · Ended on · Visit awaiting review · Completed by ·
Completed on · Reviewed by · Reviewed on · Review note · Inactive · Deleted · Client ID ·
Updated), **Staff** (Email · Name · Role · Notes) and **Audit log** (Time · User · Action ·
Client · Client ID · Details). Missing columns are added at the end by themselves.

## Set it up

1. Open the Supervisory Visits sheet → **Extensions → Apps Script**.
2. In **Code.gs**, replace everything with `apps-script/visits/Code.gs`. Save.
3. Click **+** next to Files → **HTML**, name it `Index` (exactly), replace everything with
   `apps-script/visits/Index.html`. Save.
4. **Deploy → New deployment** → **Web app**. **Execute as: Me**. **Who has access: Anyone
   within [your organization]**. Deploy, authorize, and copy the **Web app URL**.
5. Open the URL yourself once: the **Staff** tab is created. Add each staff member's work
   email in the **Email** column.
6. **Deploy → Manage deployments**: archive the old web app deployment (the one the GitHub
   page used), and remove the `PASSCODE` script property (Project Settings).
7. Give staff the new URL (bookmark it). It only works for signed-in staff on the list.

To remove someone's access, delete their row in the Staff tab; it takes effect immediately.

## Editing in the sheet

Keep the sheet itself shared only with yourself (and a backup admin); staff use the page.
You can edit cells in the Clients tab: **Updated** is filled in for you, and a new **Last
visit** fills in **Next due**. To delete a client, put `Yes` in **Deleted**. Edits made
directly in the sheet are in the sheet's version history, not the Audit log.

## If you change the script later

**Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy** keeps the
same URL.
