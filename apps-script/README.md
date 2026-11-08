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

1. Open the sheet:
   https://docs.google.com/spreadsheets/d/1Q1X3haayr442C473qcWx1vCyIvRGo6oluwb00U_3QXY/edit
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
