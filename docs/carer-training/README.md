# Annual Caregiver Training

A small static site: a caregiver

1. watches the training video,
2. takes a 14-question quiz (must get 80% — 12 of 14 — to pass; answers are never shown),
3. reads and signs the Annual Caregiver Training Acknowledgement (tick box, first and last name, typed signature, date),
4. gets the signed form to download as PDF or print, named `First Last 2026.pdf`.

A "Have a question?" box at the bottom of every step emails questions to the office.
No server, no build step.

## Change things

Everything editable is in `config.js`:

- `questions` — the quiz, from "Quiz - Annual Training.docx".
  `answer` is the index of the correct option, counting from 0.
- `sheetUrl` — optional Google Apps Script that adds a row per completion to a
  Google Sheet. Setup: `apps-script/README.md` in the repository root.
- `formSubmitId` — FormSubmit's code for the office inbox, which gets completion records
  and questions. (The email address itself is deliberately not in this code.)
- `passPercent` — percentage needed to pass (80, rounded up: 12 of 14).
- `form` — the acknowledgement caregivers sign: title, organisation, training length,
  topics and the statements they confirm.
- `youtubeId`, `watchPercent` — the training video on YouTube (Unlisted, embedding
  allowed). The site counts the seconds actually played (skipping ahead doesn't count),
  saves progress on the device, and keeps the quiz locked until `watchPercent` (90) is
  reached. The percentage watched goes into the email, the signed PDF and the sheet. If
  YouTube can't load at all, the quiz unlocks after 20 seconds and records "Not tracked".
- `driveVideoId` — fallback Google Drive video, used only if `youtubeId` is empty (no
  watch tracking). Share it as "Anyone with the link can view".

## Completion notice

When someone signs, the page emails the office through
[FormSubmit](https://formsubmit.co) (free, no account) with the completion record
and the signed PDF attached (`First Last 2026.pdf`). If the attachment is refused,
it sends the record without it and asks the caregiver to email the PDF.
`formSubmitId` is FormSubmit's code for the office inbox. Set `autoSend: false` to
turn this off.

The last page also shows a pre-written email with "Open in my email app" and
"Copy" buttons, as a fallback.

## Files

`vendor/html2pdf.bundle.min.js` is html2pdf.js 0.10.1 (MIT licence, see
`vendor/html2pdf-LICENSE.txt`), copied from the official npm package rather than
loaded from a CDN, so no outside site can change the code that runs on this page.

## Updating the site

On every change, bump the version in **both** `app.js` (`VERSION`) and `index.html`
(`data-version` and the `?v=` on `style.css`, `config.js` and `app.js`). GitHub Pages
lets browsers cache files for about 10 minutes, so right after an update a browser
can pair an old cached page with the new script. The version check spots that and
reloads the page once; without it, the quiz breaks for those caregivers.
