# Save signed forms to Google Drive

`SaveSignedForm.gs` is a small Google Apps Script. When a caregiver signs the
form on the carer-training site, the site sends the signed PDF to this script,
and the script saves it in the Google Drive folder as `First Last 2026.pdf`.

## Set it up (once, about 5 minutes)

1. Sign in to Google with the account that owns the Drive folder, and open
   <https://script.google.com>. Click **New project**.
2. Delete everything in the editor, paste in all of `SaveSignedForm.gs`, and
   click the save icon. Name the project, for example "Save signed training forms".
3. Click **Deploy → New deployment**. Click the gear next to "Select type" and
   choose **Web app**. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**, then **Authorize access** and allow it to use Google Drive.
   (If Google warns the app isn't verified, click **Advanced → Go to … (unsafe)** —
   it's your own script.)
5. Copy the **Web app URL** (it ends in `/exec`) and put it in
   `docs/carer-training/config.js` as `driveUploadUrl`.

## If you change the script later

Use **Deploy → Manage deployments → edit (pencil) → Version: New version →
Deploy**. That keeps the same URL. A *new* deployment gets a new URL, which
would then have to go in `config.js` again.

## Things to know

- "Who has access: Anyone" means anyone who finds the URL could send a PDF to
  the folder. The script only accepts PDFs under 10 MB and can only add files to
  this one folder. It can't read, change or delete anything.
- If someone signs twice (for example after retaking the training), Drive keeps
  both files with the same name.
