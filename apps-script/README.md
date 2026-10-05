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
