(function () {
  "use strict";

  const cfg = window.TRAINING_CONFIG;
  const $ = (id) => document.getElementById(id);
  const total = cfg.questions.length;
  let result = null;

  // ----- Setup -----
  document.title = cfg.title;
  $("page-title").textContent = cfg.title;
  $("pass-mark-text").textContent = `${cfg.passMark} of ${total}`;
  $("video-frame").src = `https://drive.google.com/file/d/${cfg.driveVideoId}/preview`;
  $("video-link").href = `https://drive.google.com/file/d/${cfg.driveVideoId}/view`;

  const qBox = $("questions");
  cfg.questions.forEach((item, i) => {
    const fs = document.createElement("fieldset");
    fs.className = "question";
    fs.id = `q${i}`;
    const legend = document.createElement("legend");
    legend.innerHTML = `<span class="num">${i + 1}.</span> `;
    legend.append(item.q);
    fs.append(legend);
    item.options.forEach((opt, j) => {
      const label = document.createElement("label");
      label.className = "option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `q${i}`;
      input.value = j;
      label.append(input, document.createTextNode(opt));
      fs.append(label);
    });
    qBox.append(fs);
  });

  // ----- Navigation -----
  function show(step) {
    ["video", "quiz", "cert"].forEach((s) => ($(`step-${s}`).hidden = s !== step));
    const order = ["video", "quiz", "cert"];
    document.querySelectorAll(".steps li").forEach((li) => {
      const idx = order.indexOf(li.dataset.step);
      li.classList.toggle("active", li.dataset.step === step);
      li.classList.toggle("done", idx < order.indexOf(step));
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $("to-quiz").onclick = () => show("quiz");
  $("back-to-video").onclick = () => show("video");
  $("retry").onclick = () => {
    $("fail-box").hidden = true;
    $("quiz-form").hidden = false;
    $("quiz-form").scrollIntoView({ behavior: "smooth" });
  };

  // ----- Quiz -----
  $("quiz-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("form-error");
    const name = $("name").value.trim();
    const email = $("email").value.trim();
    document.querySelectorAll(".question").forEach((q) => q.classList.remove("wrong", "missing"));

    if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
      err.textContent = "Please enter your full name and a valid email address.";
      err.hidden = false;
      (name ? $("email") : $("name")).focus();
      return;
    }
    const answers = cfg.questions.map((_, i) => {
      const c = document.querySelector(`input[name="q${i}"]:checked`);
      return c ? Number(c.value) : null;
    });
    const missing = answers.map((a, i) => (a === null ? i : -1)).filter((i) => i >= 0);
    if (missing.length) {
      missing.forEach((i) => $(`q${i}`).classList.add("missing"));
      err.textContent = `Please answer all questions (${missing.length} left).`;
      err.hidden = false;
      $(`q${missing[0]}`).scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    err.hidden = true;

    let score = 0;
    answers.forEach((a, i) => {
      if (a === cfg.questions[i].answer) score++;
      else $(`q${i}`).classList.add("wrong");
    });

    if (score < cfg.passMark) {
      $("fail-score").textContent = `${score} of ${total} correct`;
      $("fail-need").textContent = cfg.passMark;
      $("fail-box").hidden = false;
      $("fail-box").scrollIntoView({ behavior: "smooth" });
      return;
    }

    document.querySelectorAll(".question").forEach((q) => q.classList.remove("wrong"));
    result = {
      name, email, score,
      date: new Date(),
      id: "CT-" + Date.now().toString(36).toUpperCase().slice(-6) +
          Math.random().toString(36).slice(2, 5).toUpperCase()
    };
    showCertificate();
  });

  // ----- Certificate -----
  function showCertificate() {
    const dateText = result.date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const scoreText = `${result.score}/${total}`;
    $("pass-score").textContent = `${result.score} of ${total}`;
    $("cert-name").textContent = result.name;
    $("cert-course").textContent = cfg.title;
    $("cert-score").textContent = scoreText;
    $("cert-date").textContent = dateText;
    $("cert-id").textContent = result.id;

    const subject = `Training completed: ${result.name}`;
    const body =
`Hi Shana,

I have completed the ${cfg.title} and passed the quiz.

Name: ${result.name}
Email: ${result.email}
Score: ${scoreText} (pass mark ${cfg.passMark}/${total})
Date: ${dateText}
Certificate ID: ${result.id}

My certificate is attached.

Best regards,
${result.name}`;

    $("notify-addr").textContent = cfg.notifyEmail;
    $("notify-addr").href = `mailto:${cfg.notifyEmail}`;
    $("mail-to").textContent = cfg.notifyEmail;
    $("mail-subject").textContent = subject;
    $("mail-body").textContent = body;
    $("mailto").href = `mailto:${cfg.notifyEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    $("copy-mail").onclick = () => {
      const text = `To: ${cfg.notifyEmail}\nSubject: ${subject}\n\n${body}`;
      navigator.clipboard.writeText(text).then(
        () => { $("copy-mail").textContent = "Copied!"; setTimeout(() => ($("copy-mail").textContent = "Copy email text"), 2000); },
        () => alert("Couldn't copy automatically — please select the text and copy it.")
      );
    };

    show("cert");
    autoNotify(subject, scoreText, dateText);
  }

  function autoNotify(subject, scoreText, dateText) {
    const status = $("notify-status");
    if (!cfg.autoSend) { status.hidden = true; return; }
    status.className = "status warn";
    status.textContent = "Sending a completion notice to Shana…";
    fetch(`https://formsubmit.co/ajax/${encodeURIComponent(cfg.notifyEmail)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: subject,
        _template: "table",
        _captcha: "false",
        Name: result.name,
        Email: result.email,
        Score: scoreText,
        Date: dateText,
        "Certificate ID": result.id,
        Training: cfg.title
      })
    })
      .then((r) => r.json())
      .then((data) => {
        if (String(data.success) === "true") {
          status.className = "status ok";
          status.textContent = "✓ A completion notice was sent to Shana automatically.";
        } else {
          throw new Error(data.message || "not sent");
        }
      })
      .catch(() => {
        status.className = "status warn";
        status.textContent = "We couldn't send the notice automatically.";
      });
  }

  $("print").onclick = () => window.print();
  $("download-pdf").onclick = () => {
    const btn = $("download-pdf");
    if (!window.html2pdf) { window.print(); return; }
    btn.disabled = true;
    btn.textContent = "Preparing PDF…";
    const el = $("certificate");
    const fileName = `Certificate - ${result.name.replace(/[^\p{L}\p{N} _-]/gu, "")}.pdf`;
    html2pdf()
      .set({
        margin: 0,
        filename: fileName,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, backgroundColor: "#fffdf8", windowWidth: 1100, width: el.offsetWidth },
        jsPDF: { unit: "px", format: [el.offsetWidth, el.offsetHeight], orientation: "landscape", hotfixes: ["px_scaling"] }
      })
      .from(el)
      .save()
      .catch(() => window.print())
      .finally(() => { btn.disabled = false; btn.textContent = "Download PDF"; });
  };
})();
