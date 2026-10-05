# Annual In-Home Care Training

A small static site: a caregiver

1. watches the training video,
2. takes a 14-question quiz (must get 80% — 12 of 14 — to pass; answers are never shown),
3. reads and signs the Annual Caregiver Training Acknowledgement (tick box, typed name, drawn signature),
4. gets the signed form to download as PDF or print.

A "Have a question?" box at the bottom of every step sends questions to `notifyEmail`.
No server, no build step.

## Change things

Everything editable is in `config.js`:

- `notifyEmail` — who gets the completion notice (**TODO: Shana's Right at Home email**).
- `questions` — the quiz, from "Quiz - Annual Training.docx".
  `answer` is the index of the correct option, counting from 0.
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
