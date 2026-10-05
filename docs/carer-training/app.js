(function () {
  "use strict";

  // Must match data-version in index.html. Bump both (and the ?v= on the
  // style/script links) on every change: right after an update, a browser can
  // otherwise pair a cached old page with this new script, which breaks the quiz.
  const VERSION = "2026-10-05.10";
  if (document.documentElement.dataset.version !== VERSION) {
    // Load the page again under a new URL so the browser can't use its cached copy.
    const key = "carer-training-reloaded-for";
    let tried = null;
    try { tried = sessionStorage.getItem(key); } catch (e) { /* storage blocked */ }
    if (tried !== VERSION) {
      try { sessionStorage.setItem(key, VERSION); } catch (e) { /* storage blocked */ }
      location.replace(`${location.pathname}?v=${encodeURIComponent(VERSION)}${location.hash}`);
      return;
    }
    // Reloading didn't help: ask the caregiver to refresh rather than run
    // against a page this script doesn't match.
    const note = document.createElement("p");
    note.className = "update-note";
    note.textContent = "This page was just updated. Please refresh the page (or close it and open the link again) before you start.";
    document.body.prepend(note);
    return;
  }

  const cfg = window.TRAINING_CONFIG;
  const $ = (id) => document.getElementById(id);
  const total = cfg.questions.length;
  const passMark = Math.ceil((total * cfg.passPercent) / 100);
  const formSubmitUrl = `https://formsubmit.co/ajax/${encodeURIComponent(cfg.formSubmitId || cfg.notifyEmail)}`;
  let result = null;

  // ----- Setup -----
  document.title = cfg.title;
  $("page-title").textContent = cfg.title;
  $("pass-mark-text").textContent = `${passMark} of ${total}`;
  $("video-frame").src = `https://drive.google.com/file/d/${cfg.driveVideoId}/preview`;
  $("form-title-h").textContent = `3. ${cfg.form.title}`;
  $("form-text").append(...formContent());

  // The acknowledgement form's text, built from cfg.form.
  function formContent() {
    const f = cfg.form;
    const el = (tag, text) => {
      const n = document.createElement(tag);
      if (text) n.textContent = text;
      return n;
    };
    const list = (items) => {
      const ol = el("ol");
      items.forEach((t) => ol.append(el("li", t)));
      return ol;
    };
    const meta = el("p");
    meta.className = "form-meta";
    meta.append(el("strong", f.org), el("br"), `Total length of training: ${f.length}`);
    return [meta, el("h3", "Topics covered"), list(f.topics),
      el("h3", "Acknowledgement"), el("p", f.intro), list(f.statements)];
  }

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

  function longDate(d) {
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  // "First Last 2026" — the downloaded PDF's name.
  function fileBase() {
    const clean = (t) => t.replace(/[^\p{L}\p{N} '_-]/gu, "").replace(/\s+/g, " ").trim();
    return `${clean(result.first)} ${clean(result.last)} ${result.date.getFullYear()}`;
  }

  // Builds the PDF with the compact .pdf-mode styles (no on-screen border or
  // padding, since the PDF has its own margins) so it fits on one letter page.
  function withPdfMode(work) {
    const el = $("signed-doc");
    el.classList.add("pdf-mode");
    return Promise.resolve(work()).finally(() => el.classList.remove("pdf-mode"));
  }

  function signedPdf() {
    return html2pdf()
      .set({
        margin: [12, 12, 12, 12],
        filename: `${fileBase()}.pdf`,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, backgroundColor: "#ffffff" },
        // Never split the signature lines across pages.
        pagebreak: { mode: "css", avoid: [".doc-sig-row", ".doc-facts tr"] },
        jsPDF: { unit: "mm", format: "letter", orientation: "portrait" }
      })
      .from($("signed-doc"));
  }

  // The signed form as a PDF file, for attaching to the completion email.
  function signedPdfFile() {
    if (!window.html2pdf) return Promise.reject(new Error("no PDF library"));
    // Wait for fonts and for show()'s smooth scroll to finish; capturing the
    // page mid-scroll produces a blank PDF.
    const settled = new Promise((resolve) => setTimeout(resolve, 1200));
    return Promise.all([settled, document.fonts ? document.fonts.ready : null])
      .then(() => withPdfMode(() => signedPdf().outputPdf("blob")))
      .then((blob) => new File([blob], `${fileBase()}.pdf`, { type: "application/pdf" }));
  }

  // Sends an email through FormSubmit's AJAX endpoint (no attachments).
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

  // Sends an email with `file` attached. FormSubmit's AJAX endpoint drops
  // attachments, so this submits a normal multipart form (the way FormSubmit
  // documents file uploads) into a hidden frame, keeping the caregiver on the
  // page. The reply can't be read across sites, so "sent" means FormSubmit
  // answered within 45 seconds.
  function postFormWithFile(data, file) {
    return new Promise((resolve, reject) => {
      if (typeof DataTransfer === "undefined") { reject(new Error("can't attach files here")); return; }
      const name = `formsubmit-${Date.now()}`;
      const frame = document.createElement("iframe");
      frame.name = name;
      frame.hidden = true;
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `https://formsubmit.co/${encodeURIComponent(cfg.formSubmitId || cfg.notifyEmail)}`;
      form.enctype = "multipart/form-data";
      form.target = name;
      form.hidden = true;
      const fields = Object.assign({ _template: "table", _captcha: "false" }, data);
      Object.keys(fields).forEach((k) => {
        // A textarea keeps line breaks, which a hidden input would drop.
        const field = document.createElement("textarea");
        field.name = k;
        field.value = fields[k];
        form.append(field);
      });
      const input = document.createElement("input");
      input.type = "file";
      input.name = "attachment";
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      form.append(input);

      const cleanUp = () => setTimeout(() => { form.remove(); frame.remove(); }, 1000);
      const timer = setTimeout(() => { cleanUp(); reject(new Error("no reply")); }, 45000);
      document.body.append(frame, form);
      frame.addEventListener("load", () => {
        // Ignore the frame's own blank page; any other load is FormSubmit's reply.
        try { if (frame.contentWindow.location.href === "about:blank") return; } catch (e) { /* cross-site: it's the reply */ }
        clearTimeout(timer);
        cleanUp();
        resolve();
      });
      form.submit();
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
  }
  $("to-quiz").onclick = () => show("quiz");
  $("back-to-video").onclick = () => show("video");

  // ----- Failed-quiz pop-up -----
  function openFailModal(score) {
    $("fail-score").textContent = `${score} of ${total}`;
    $("fail-need").textContent = `${passMark} of ${total}`;
    $("fail-modal").hidden = false;
    document.body.classList.add("modal-open");
    $("retry").focus();
  }
  function closeFailModal() {
    $("fail-modal").hidden = true;
    document.body.classList.remove("modal-open");
  }
  // Clear the wrong answers (they stay highlighted) and jump to the first one.
  function retake() {
    closeFailModal();
    const wrong = document.querySelectorAll(".question.wrong");
    wrong.forEach((q) => q.querySelectorAll("input").forEach((input) => (input.checked = false)));
    if (wrong.length) {
      wrong[0].scrollIntoView({ block: "center" });
      wrong[0].querySelector("input").focus({ preventScroll: true });
    }
  }
  $("retry").onclick = retake;
  $("fail-video").onclick = () => { closeFailModal(); show("video"); };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("fail-modal").hidden) retake();
  });
  // Picking a new answer for a highlighted question removes its highlight.
  $("questions").addEventListener("change", (e) => {
    const q = e.target.closest(".question");
    if (q) q.classList.remove("wrong", "missing");
  });

  // ----- Quiz -----
  $("quiz-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("form-error");
    const first = $("first").value.trim();
    const last = $("last").value.trim();
    const email = $("email").value.trim();
    document.querySelectorAll(".question").forEach((q) => q.classList.remove("wrong", "missing"));

    if (!first || !last || !/^\S+@\S+\.\S+$/.test(email)) {
      err.textContent = "Please enter your first name, last name and a valid email address.";
      err.hidden = false;
      $(!first ? "first" : !last ? "last" : "email").focus();
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
      $(`q${missing[0]}`).scrollIntoView({ block: "center" });
      return;
    }
    err.hidden = true;

    let score = 0;
    answers.forEach((a, i) => {
      if (a === cfg.questions[i].answer) score++;
      else $(`q${i}`).classList.add("wrong");
    });

    if (score < passMark) {
      openFailModal(score);
      return;
    }

    document.querySelectorAll(".question").forEach((q) => q.classList.remove("wrong"));
    result = { email, score };
    $("pass-score").textContent = `${score} of ${total} correct`;
    $("sign-first").value = first;
    $("sign-last").value = last;
    $("sign-date").value = longDate(new Date());
    if (!$("ask-name").value) $("ask-name").value = `${first} ${last}`;
    if (!$("ask-email").value) $("ask-email").value = email;
    show("sign");
  });

  // ----- Sign -----
  $("sign-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("sign-error");
    const first = $("sign-first").value.trim();
    const last = $("sign-last").value.trim();
    const signature = $("sign-sig").value.trim();
    let msg = "";
    if (!$("agree").checked) msg = "Please tick the box to confirm you agree.";
    else if (!first || !last) msg = "Please type your first and last name.";
    else if (!signature) msg = "Please type your full name in the signature box to sign.";
    if (msg) {
      err.textContent = msg;
      err.hidden = false;
      $(!$("agree").checked ? "agree" : !first ? "sign-first" : !last ? "sign-last" : "sign-sig").focus();
      return;
    }
    err.hidden = true;

    result.first = first;
    result.last = last;
    result.signedName = `${first} ${last}`;
    result.signature = signature;
    result.date = new Date();
    result.id = "CT-" + Date.now().toString(36).toUpperCase().slice(-6) +
      Math.random().toString(36).slice(2, 5).toUpperCase();
    showDone();
  });

  // ----- Done -----
  function showDone() {
    const dateText = longDate(result.date);
    const scoreText = `${result.score}/${total}`;
    $("doc-org").textContent = cfg.form.org;
    $("doc-title").textContent = cfg.form.title;
    $("doc-body").replaceChildren(...formContent().slice(1));
    $("doc-name").textContent = result.signedName;
    $("doc-email").textContent = result.email;
    $("doc-course").textContent = cfg.title;
    $("doc-length").textContent = cfg.form.length;
    $("doc-score").textContent = `${scoreText} (pass mark ${passMark}/${total})`;
    $("doc-date").textContent = dateText;
    $("doc-id").textContent = result.id;
    $("doc-sig-text").textContent = result.signature;
    $("doc-sig-date").textContent = dateText;

    const subject = `Training completed and form signed: ${result.signedName}`;
    show("done");

    const status = $("notify-status");
    if (!cfg.autoSend) { status.hidden = true; return; }
    status.className = "status warn";
    status.textContent = "Sending your signed form to the office…";
    const record = {
      _subject: subject,
      "First name": result.first,
      "Last name": result.last,
      Signature: result.signature,
      Email: result.email,
      Score: scoreText,
      "Date signed": dateText,
      "Record ID": result.id,
      Training: cfg.title,
      Form: cfg.form.title,
      "Agreed to form": "Yes",
      "Confirmed": cfg.form.statements.join("\n")
    };
    const fail = () => {
      status.className = "status warn";
      status.textContent = `We couldn't send your signed form automatically — please download it and email it to ${cfg.notifyEmail}.`;
    };

    // Email the record with the signed PDF attached. If that fails, still send
    // the record without it and ask the caregiver to email the PDF.
    signedPdfFile()
      .then((file) => postFormWithFile(record, file))
      .then(() => {
        status.className = "status ok";
        status.textContent = "✓ Your signed form was emailed to the office.";
      })
      .catch(() =>
        postForm(Object.assign({}, record, { "Signed PDF": "Not attached — ask the caregiver to email it." }))
          .then(() => {
            status.className = "status warn";
            status.textContent = `Your completion record was sent, but the signed PDF couldn't be attached — please download it and email it to ${cfg.notifyEmail}.`;
          }, fail)
      );
  }

  $("print").onclick = () => window.print();
  $("download-pdf").onclick = () => {
    const btn = $("download-pdf");
    if (!window.html2pdf) { window.print(); return; }
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing PDF…";
    withPdfMode(() => signedPdf().save())
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
