// ---------------------------------------------------------------------------
// Settings for the training page. Everything you may want to change is here.
// ---------------------------------------------------------------------------

window.TRAINING_CONFIG = {
  title: "Annual Caregiver Training",

  // Completion records and caregiver questions are emailed here.
  notifyEmail: "[email removed]",

  // FormSubmit's alias for notifyEmail (given after activation), so the
  // automatic emails don't put the address in the request.
  formSubmitId: "d344e0396b860ca96cb4112c22e5b833",

  // Web app URL of the Google Apps Script that adds a row to the completions
  // Google Sheet (apps-script/CompletionsSheet.gs). Leave empty to turn it off.
  sheetUrl: "https://script.google.com/macros/s/AKfycbwy2R7XDDSDBPFRS1jVaFKcrg8wLnGjqq7f6DF8dnuzjKg1FtmeqtArDKb0R9XpiHGb/exec",

  // Google Drive file ID of the training video. The file must be shared as
  // "Anyone with the link can view", otherwise the embedded player stays blank.
  driveVideoId: "1H7-OliYsH8shxI7KFLKSqMc8ZtP9kkKM",

  // Percentage of correct answers needed to pass. With 14 questions, 80% = 12.
  passPercent: 80,

  // Send the completion notice and questions automatically through
  // FormSubmit.co (free, no account). The very first submission sends Shana an
  // activation email; until she clicks it, nothing is delivered. The
  // pre-written email shown on the last page works either way.
  autoSend: true,

  // The form caregivers sign after passing the quiz, from
  // "Annual Caregiver Training Acknowledgement.docx".
  form: {
    title: "Annual Caregiver Training Acknowledgement",
    org: "Right at Home Boulder Colorado",
    length: "1.5 hours",
    topics: [
      "Caregiver Role and Expectations: professionalism, attendance and scheduling, communication with the office, attire, and sharing contact information",
      "Home Care Consumer Rights",
      "Mistreatment, abuse, neglect, and exploitation (MANE) and mandatory reporting",
      "Behavior Management - Working with clients with dementia",
      "Home & Fire Safety",
      "Emergency Procedures",
      "Infection Control and Exposure Prevention",
      "Basic First Aid"
    ],
    intro: "By signing below, I confirm that:",
    statements: [
      "I completed the entire annual training listed above.",
      "I understand the material and had the opportunity to ask questions.",
      "I understand that I must honor client rights and follow agency policies and procedures."
    ]
  },

  // Questions and answer key from "Quiz - Annual Training.docx".
  // `answer` is the index of the correct option, counting from 0 (A=0, B=1, C=2, D=3).
  // Answers are used only for grading and are never shown on the page.
  questions: [
    {
      q: "How soon must suspected abuse of an at-risk adult be reported to law enforcement?",
      options: [
        "Within 7 days",
        "By the end of your next shift",
        "Within 24 hours",
        "Only after the office confirms it happened"
      ],
      answer: 2  // C
    },
    {
      q: "You arrive for a shift and cannot reach the client. What should you do?",
      options: [
        "Leave and go home",
        "Notify the office immediately and do not leave",
        "Wait 24 hours, then call the office",
        "Ask a neighbor to handle it and clock out"
      ],
      answer: 1  // B
    },
    {
      q: "Which of the following is a client right?",
      options: [
        "The right to refuse treatment and be informed of the consequences",
        "The right to receive your personal phone number",
        "The right to set caregiver pay rates",
        "The right to waive confidentiality rules for others"
      ],
      answer: 0  // A
    },
    {
      q: "A client with dementia keeps asking what time their doctor's appointment is. What is the best response?",
      options: [
        "“I've already told you three times.”",
        "“You don't have an appointment today.”",
        "Try to understand why they are asking and reassure them, such as “It's 9am. I'll make sure you won't be late.”",
        "Ignore the question"
      ],
      answer: 2  // C
    },
    {
      q: "What is the safest way to physically approach a person with dementia?",
      options: [
        "From behind so you can help quickly",
        "From the side while speaking loudly",
        "From the front",
        "It doesn't matter"
      ],
      answer: 2  // C
    },
    {
      q: "A client falls and has no apparent serious injury. What should you do?",
      options: [
        "Lift the client back up right away",
        "Wait until the end of the shift to report it",
        "Do not lift them. Send a critical message on Trillian and call the office immediately",
        "Ask the client not to mention it"
      ],
      answer: 2  // C
    },
    {
      q: "A fire starts in a client's home. What should you do?",
      options: [
        "Call the office first and wait for instructions",
        "Call 911, move yourself and the client to safety if it is safe to do so, and contact the office once you are safe",
        "Search the house for valuables",
        "Stay put until the client decides what to do"
      ],
      answer: 1  // B
    },
    {
      q: "When operating a fire extinguisher using the PASS method, what does the “A” stand for?",
      options: [
        "Alert",
        "Aim at the base of the fire",
        "Activate the alarm",
        "Avoid the flames"
      ],
      answer: 1  // B
    },
    {
      q: "A client is choking and cannot cough, speak, or breathe. What should you do?",
      options: [
        "Give them water to wash it down",
        "Call 911 and start the choking first aid techniques you were trained in",
        "Wait for the office to call you back",
        "Lay them flat and leave to find help"
      ],
      answer: 1  // B
    },
    {
      q: "A client suddenly has a drooping face and slurred speech. What should you do?",
      options: [
        "Let them rest and check again in an hour",
        "Call 911 immediately and note the time the symptoms started",
        "Give them aspirin from the medicine cabinet",
        "Call the office and wait for instructions before doing anything else"
      ],
      answer: 1  // B
    },
    {
      q: "A client gets a small burn from a hot pan. The skin is red but not blistered. What should you do first?",
      options: [
        "Put ice directly on the burn",
        "Cool the burn under cool running water for several minutes",
        "Spread butter on it",
        "Pop any blisters that form"
      ],
      answer: 1  // B
    },
    {
      q: "You find a client on the floor who does not respond and is not breathing normally. What should you do?",
      options: [
        "Call the office and wait for instructions",
        "Call 911 right away and follow the dispatcher's instructions, starting CPR if you are trained",
        "Give them water and sit them up",
        "Wait a few minutes to see if they wake up"
      ],
      answer: 1  // B
    },
    {
      q: "A client has a seizure while sitting in a chair. What should you do?",
      options: [
        "Hold them down so they stop shaking",
        "Put a spoon or cloth in their mouth",
        "Stay with them, move hazards away, protect their head, note the time, and call 911 as needed",
        "Throw cold water on their face"
      ],
      answer: 2  // C
    },
    {
      q: "A client reports chest pain and pressure, and feels sweaty and short of breath. What should you do?",
      options: [
        "Tell them to lie down and rest for an hour",
        "Call 911 right away, then notify the office",
        "Give them food and water and watch for changes",
        "Wait for a family member to arrive"
      ],
      answer: 1  // B
    }
  ]
};
