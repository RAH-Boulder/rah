// ---------------------------------------------------------------------------
// Settings for the training page. Everything you may want to change is here.
// ---------------------------------------------------------------------------

window.TRAINING_CONFIG = {
  title: "Annual In-Home Care Training",

  // TODO: replace with Shana's Right at Home email address.
  notifyEmail: "[email removed]",

  // Google Drive file ID of the training video. The file must be shared as
  // "Anyone with the link can view", otherwise the embedded player stays blank.
  driveVideoId: "1gsvwQfJpxmCEwC33AqXlxKpRmBbFBbn0",

  // Correct answers needed to pass (out of the number of questions below).
  passMark: 8,

  // Send the completion notice automatically through FormSubmit.co (free, no
  // account). The very first submission sends Shana an activation email; until
  // she clicks it, notices are not delivered. The pre-written email shown on
  // the certificate page works either way.
  autoSend: true,

  // Questions come strictly from the "Annual Training – Right at Home Boulder"
  // slides (Annual_Training_20261003_small.pptx).
  // `answer` is the index of the correct option, counting from 0.
  questions: [
    {
      q: "The WellSky app isn't working and you need to clock in. What should you do?",
      options: [
        "Skip clocking in and tell the office at the end of the week",
        "Call Telephony from your own phone",
        "Call Telephony from the client's phone, using the number on the back of your badge",
        "Ask the client to note your arrival time on paper"
      ],
      answer: 2
    },
    {
      q: "What is the minimum notice required to cancel a scheduled shift?",
      options: ["2 hours", "12 hours", "24 hours", "2 weeks"],
      answer: 2
    },
    {
      q: "What happens if you cancel 3 or more shifts with less than 24 hours' notice within any 60-day period?",
      options: [
        "You are automatically removed from all active shifts, and it can result in termination",
        "Nothing, as long as you send a critical message each time",
        "You receive a verbal warning from the office",
        "Your hourly pay is reduced for the next month"
      ],
      answer: 0
    },
    {
      q: "Your client asks you to stay an hour past your scheduled shift. What should you do?",
      options: [
        "Stay — extra time is always paid",
        "Notify the office on Trillian first; the extra time is paid only if the office approves it",
        "Agree, and record the extra hour in your care notes",
        "Refuse; caregivers may never stay late"
      ],
      answer: 1
    },
    {
      q: "A client asks for your personal phone number so they can call you directly. What should you do?",
      options: [
        "Give it to them; it builds trust",
        "Give them your email instead of your phone number",
        "Share it only with the client's family",
        "Don't share it — contact between caregivers and clients is handled by the office"
      ],
      answer: 3
    },
    {
      q: "As a mandatory reporter, you suspect a client is being financially exploited but you aren't sure. What should you do?",
      options: [
        "Investigate and collect proof before saying anything",
        "Ask the family member you suspect about it",
        "Report it to agency management right away — when in doubt, report it",
        "Wait until you are certain"
      ],
      answer: 2
    },
    {
      q: "A client with dementia says today is Tuesday, but it's actually Wednesday. Following the golden rules, what should you do?",
      options: [
        "Just nod and smile — don't contradict or argue",
        "Gently correct them so they stay oriented",
        "Show them a calendar to prove the date",
        "Ask them direct questions to test their memory"
      ],
      answer: 0
    },
    {
      q: "How should you physically approach a person with dementia?",
      options: [
        "From the side, so you don't block their view",
        "From the front, because their peripheral vision is limited",
        "From behind, quietly, so you don't disturb them",
        "Quickly, so they don't have time to get anxious"
      ],
      answer: 1
    },
    {
      q: "Your client falls and there's no apparent serious injury. What is the correct procedure?",
      options: [
        "Lift the client back up yourself, then tell the office",
        "Help the client up and note the fall in WellSky at the end of your shift",
        "Leave the client on the floor and wait for family to arrive",
        "Don't lift them — send a critical message on Trillian and call the office, which will call the local lift assist"
      ],
      answer: 3
    },
    {
      q: "According to infection-control guidelines, how should you treat blood and bodily fluids?",
      options: [
        "As infectious only if the client shows symptoms",
        "As potentially infectious at all times, using Standard Precautions",
        "As safe, as long as you wash your hands afterwards",
        "As infectious only if the client has a known diagnosis such as MRSA"
      ],
      answer: 1
    }
  ]
};
