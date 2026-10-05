# Annual In-Home Care Training

A small static site: a caregiver

1. watches the training video,
2. takes a 10-question quiz (must get 80% — 8 of 10 — to pass),
3. reads and signs the training form (tick box, typed name, drawn signature),
4. gets the signed form to download as PDF or print.

A "Have a question?" box at the bottom of every step sends questions to `notifyEmail`.
No server, no build step.

## Change things

Everything editable is in `config.js`:

- `notifyEmail` — who gets the completion notice (**TODO: Shana's Right at Home email**).
- `questions` — the quiz, taken from the Right at Home Boulder annual training slides.
  `answer` is the index of the correct option, counting from 0.
- `passMark` — correct answers needed to pass (default 8 of 10).
- `formTitle`, `formText` — the form caregivers sign (**TODO: paste your form's wording**).
  Each string in `formText` is one paragraph.
- `orgName` — shown at the top of the signed form.
- `driveVideoId` — the Google Drive video. Share it as "Anyone with the link can view".

## Completion notice

When someone signs the form, the page tries to email `notifyEmail` through
[FormSubmit](https://formsubmit.co) (free, no account). The **first** submission
sends an activation email to that address — the recipient must click it once,
otherwise nothing is delivered. Changing `notifyEmail` needs a new activation.
Set `autoSend: false` to turn this off.

Either way, the last page shows a pre-written email with a "Open in my
email app" button and a "Copy" button, so the caregiver can send it themselves.
