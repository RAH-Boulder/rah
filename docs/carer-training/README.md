# Annual In-Home Care Training

A small static site: a caregiver

1. watches the training video,
2. takes a 14-question quiz (must get 80% — 12 of 14 — to pass; answers are never shown),
3. reads and signs the Annual Caregiver Training Acknowledgement (tick box, first and last name, typed signature, date),
4. gets the signed form to download as PDF or print. A copy is saved automatically
   to the office's Google Drive folder as `First Last 2026.pdf`.

A "Have a question?" box at the bottom of every step sends questions to `notifyEmail`.
No server, no build step.

## Change things

Everything editable is in `config.js`:

- `notifyEmail` — who gets completion records and questions ([email removed]).
- `questions` — the quiz, from "Quiz - Annual Training.docx".
  `answer` is the index of the correct option, counting from 0.
- `formSubmitId` — FormSubmit's alias for `notifyEmail`, used for the automatic emails.
- `driveUploadUrl` — the Google Apps Script web app that saves signed forms to Google
  Drive. Setup: `apps-script/README.md` in the repository root.
- `passPercent` — percentage needed to pass (80, rounded up: 12 of 14).
- `form` — the acknowledgement caregivers sign: title, organisation, training length,
  topics and the statements they confirm.
- `driveVideoId` — the Google Drive video. Share it as "Anyone with the link can view".

## Completion notice

When someone signs the form, the page tries to email `notifyEmail` through
[FormSubmit](https://formsubmit.co) (free, no account). The **first** submission
sends an activation email to that address — the recipient must click it once,
otherwise nothing is delivered. Changing `notifyEmail` needs a new activation.
Set `autoSend: false` to turn this off.

Either way, the last page shows a pre-written email with a "Open in my
email app" button and a "Copy" button, so the caregiver can send it themselves.

## Files

`vendor/html2pdf.bundle.min.js` is html2pdf.js 0.10.1 (MIT licence, see
`vendor/html2pdf-LICENSE.txt`), copied from the official npm package rather than
loaded from a CDN, so no outside site can change the code that runs on this page.
