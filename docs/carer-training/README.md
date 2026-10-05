# Annual Caregiver Training

A small static site: a caregiver

1. watches the training video,
2. takes a 14-question quiz (must get 80% — 12 of 14 — to pass; answers are never shown),
3. reads and signs the Annual Caregiver Training Acknowledgement (tick box, first and last name, typed signature, date),
4. gets the signed form to download as PDF or print, named `First Last 2026.pdf`.

A "Have a question?" box at the bottom of every step sends questions to `notifyEmail`.
No server, no build step.

## Change things

Everything editable is in `config.js`:

- `notifyEmail` — who gets completion records and questions ([email removed]).
- `questions` — the quiz, from "Quiz - Annual Training.docx".
  `answer` is the index of the correct option, counting from 0.
- `formSubmitId` — FormSubmit's alias for `notifyEmail`, used for the automatic emails.
- `passPercent` — percentage needed to pass (80, rounded up: 12 of 14).
- `form` — the acknowledgement caregivers sign: title, organisation, training length,
  topics and the statements they confirm.
- `driveVideoId` — the Google Drive video. Share it as "Anyone with the link can view".

## Completion notice

When someone signs, the page emails `notifyEmail` through
[FormSubmit](https://formsubmit.co) (free, no account) with the completion record
and the signed PDF attached (`First Last 2026.pdf`). If the attachment is refused,
it sends the record without it and asks the caregiver to email the PDF.
`formSubmitId` is FormSubmit's alias for `notifyEmail`. Set `autoSend: false` to
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
