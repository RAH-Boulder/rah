# Annual In-Home Care Training

A small static site: a caregiver watches the training video, takes a 10-question
quiz (with name and email) and, on passing, gets a certificate they can download
as PDF or print. No server, no build step.

## Change things

Everything editable is in `config.js`:

- `notifyEmail` — who gets the completion notice (**TODO: Shana's Right at Home email**).
- `questions` — the quiz, taken from the Right at Home Boulder annual training slides.
  `answer` is the index of the correct option, counting from 0.
- `passMark` — correct answers needed to pass (default 8 of 10).
- `driveVideoId` — the Google Drive video. Share it as "Anyone with the link can view".

## Completion notice

When someone passes, the page tries to email `notifyEmail` through
[FormSubmit](https://formsubmit.co) (free, no account). The **first** submission
sends an activation email to that address — the recipient must click it once,
otherwise nothing is delivered. Changing `notifyEmail` needs a new activation.
Set `autoSend: false` to turn this off.

Either way, the certificate page shows a pre-written email with a "Open in my
email app" button and a "Copy" button, so the caregiver can send it themselves.
