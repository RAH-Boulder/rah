(function () {
  "use strict";

  const cfg = window.TRAINING_CONFIG;
  const $ = (id) => document.getElementById(id);
  const total = cfg.questions.length;
  const formSubmitUrl = `https://formsubmit.co/ajax/${encodeURIComponent(cfg.notifyEmail)}`;
  let result = null;

  // ----- Setup -----
  document.title = cfg.title;
  $("page-title").textContent = cfg.title;
  $("pass-mark-text").textContent = `${cfg.passMark} of ${total}`;
  $("video-frame").src = `https://drive.google.com/file/d/${cfg.driveVideoId}/preview`;
  $("video-link").href = `https://drive.google.com/file/d/${cfg.driveVideoId}/view`;
  $("form-title-h").textContent = `3. ${cfg.formTitle}`;
  cfg.formText.forEach((para) => {
    const p = document.createElement("p");
    p.textContent = para;
    $("form-text").append(p);
  });

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

  function postForm(data) {
    return fetch(formSubmitUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(Object.assign({ _template: "table", _captcha: "false" }, data))
    })
      .then((r) => r.json())
      .then((res) => {
        if (String(res.success) !== "true") throw new Error(res.message || "not sent");
      });
  }

  // ----- Navigation -----
  const order = ["video", "quiz", "sign", "done"];
  function show(step) {
    order.forEach((s) => ($(`step-${s}`).hidden = s !== step));
    document.querySelectorAll(".steps li").forEach((li) => {
      const idx = order.indexOf(li.dataset.step);
      li.classList.toggle("active", li.dataset.step === step);
      li.classList.toggle("done", idx < order.indexOf(step));
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (step === "sign") sizePad();
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
    result = { name, email, score };
    $("pass-score").textContent = `${score} of ${total} correct`;
    $("sign-name").value = name;
    if (!$("ask-name").value) $("ask-name").value = name;
    if (!$("ask-email").value) $("ask-email").value = email;
    show("sign");
  });

  // ----- Signature pad -----
  const pad = $("sig-pad");
  const ctx = pad.getContext("2d");
  let drawing = false;
  let hasInk = false;

  function sizePad() {
    const ratio = window.devicePixelRatio || 1;
    const w = pad.clientWidth;
    const h = pad.clientHeight;
    if (!w || (pad.width === Math.round(w * ratio) && pad.height === Math.round(h * ratio))) return;
    pad.width = Math.round(w * ratio);
    pad.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1f2a37";
    hasInk = false;
  }
  window.addEventListener("resize", () => { if (!hasInk) sizePad(); });

  function point(e) {
    const r = pad.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    drawing = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y);
    ctx.stroke();
    hasInk = true;
  });
  pad.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((t) =>
    pad.addEventListener(t, () => (drawing = false))
  );
  $("sig-clear").onclick = () => {
    ctx.clearRect(0, 0, pad.width, pad.height);
    hasInk = false;
  };

  // ----- Sign -----
  $("sign-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("sign-error");
    const signedName = $("sign-name").value.trim();
    let msg = "";
    if (!$("agree").checked) msg = "Please tick the box to confirm you agree.";
    else if (!signedName) msg = "Please type your full name.";
    else if (!hasInk) msg = "Please draw your signature in the box.";
    if (msg) { err.textContent = msg; err.hidden = false; return; }
    err.hidden = true;

    result.signedName = signedName;
    result.signature = pad.toDataURL("image/png");
    result.date = new Date();
    result.id = "CT-" + Date.now().toString(36).toUpperCase().slice(-6) +
      Math.random().toString(36).slice(2, 5).toUpperCase();
    showDone();
  });

  // ----- Done -----
  function showDone() {
    const dateText = result.date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const scoreText = `${result.score}/${total}`;
    $("doc-org").textContent = cfg.orgName;
    $("doc-title").textContent = cfg.formTitle;
    $("doc-body").replaceChildren(...cfg.formText.map((t) => {
      const p = document.createElement("p");
      p.textContent = t;
      return p;
    }));
    $("doc-name").textContent = result.signedName;
    $("doc-email").textContent = result.email;
    $("doc-course").textContent = cfg.title;
    $("doc-score").textContent = `${scoreText} (pass mark ${cfg.passMark}/${total})`;
    $("doc-date").textContent = dateText;
    $("doc-id").textContent = result.id;
    $("doc-sig-img").src = result.signature;

    const subject = `Training completed and form signed: ${result.signedName}`;
    const body =
`Hello,

I have completed the ${cfg.title}, passed the quiz and signed the ${cfg.formTitle}.

Name: ${result.signedName}
Email: ${result.email}
Score: ${scoreText} (pass mark ${cfg.passMark}/${total})
Date signed: ${dateText}
Record ID: ${result.id}

My signed form is attached.

Best regards,
${result.signedName}`;

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

    show("done");

    const status = $("notify-status");
    if (!cfg.autoSend) { status.hidden = true; return; }
    status.className = "status warn";
    status.textContent = "Sending your completion record to the office…";
    postForm({
      _subject: subject,
      Name: result.signedName,
      Email: result.email,
      Score: scoreText,
      "Date signed": dateText,
      "Record ID": result.id,
      Training: cfg.title,
      Form: cfg.formTitle,
      "Agreed to form": "Yes",
      "Form text": cfg.formText.join("\n\n")
    })
      .then(() => {
        status.className = "status ok";
        status.textContent = "✓ Your completion record was sent to the office.";
      })
      .catch(() => {
        status.className = "status warn";
        status.textContent = "We couldn't send your record automatically — please email your signed PDF using the button below.";
      });
  }

  $("print").onclick = () => window.print();
  $("download-pdf").onclick = () => {
    const btn = $("download-pdf");
    if (!window.html2pdf) { window.print(); return; }
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing PDF…";
    const fileName = `Signed training form - ${result.signedName.replace(/[^\p{L}\p{N} _-]/gu, "")}.pdf`;
    html2pdf()
      .set({
        margin: [12, 12, 12, 12],
        filename: fileName,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "letter", orientation: "portrait" }
      })
      .from($("signed-doc"))
      .save()
      .catch(() => window.print())
      .finally(() => { btn.disabled = false; btn.textContent = label; });
  };

  // ----- Questions -----
  $("ask-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const status = $("ask-status");
    const name = $("ask-name").value.trim();
    const email = $("ask-email").value.trim();
    const text = $("ask-text").value.trim();
    status.hidden = false;
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !text) {
      status.className = "status error";
      status.textContent = "Please fill in your name, a valid email and your question.";
      return;
    }
    const subject = `Training question from ${name}`;
    const mailto = `mailto:${cfg.notifyEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text + "\n\n" + name + "\n" + email)}`;
    const btn = $("ask-send");
    btn.disabled = true;
    status.className = "status warn";
    status.textContent = "Sending…";
    postForm({ _subject: subject, _replyto: email, Name: name, Email: email, Question: text, Training: cfg.title })
      .then(() => {
        status.className = "status ok";
        status.textContent = "✓ Thanks — your question was sent. We'll reply by email.";
        $("ask-text").value = "";
      })
      .catch(() => {
        status.className = "status error";
        status.innerHTML = "";
        status.append("We couldn't send it automatically. ");
        const a = document.createElement("a");
        a.href = mailto;
        a.textContent = "Email your question instead";
        status.append(a, ".");
      })
      .finally(() => { btn.disabled = false; });
  });
})();
