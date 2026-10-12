(() => {
  const $ = id => document.getElementById(id);
  const state = { accessCode: "", stream: null, recorder: null, chunks: [], videoBlob: null, documents: [], code: "", startedAt: 0, timer: null, receipt: "" };
  const maxDocuments = 10;
  const maxFileSize = 150 * 1024 * 1024; // Server enforces its configured limit too.

  function setMessage(message, type = "") {
    const el = $("submitMessage");
    el.textContent = message;
    el.className = "submit-message" + (type ? " " + type : "");
  }
  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }
  function newCode() {
    state.code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
    $("verificationCode").textContent = state.code.split("").join(" ");
  }
  function detailsComplete() {
    return $("fullName").value.trim().length > 0 &&
      $("referenceId").value.trim().length > 0 &&
      $("documentType").value.length > 0 &&
      $("purpose").value.length > 0;
  }
  function updateChecklist() {
    const checks = {
      details: detailsComplete(),
      video: !!state.videoBlob,
      docs: state.documents.length > 0,
      consent: $("consent").checked && $("declaration").checked
    };
    Object.entries(checks).forEach(([key, done]) => {
      const li = document.querySelector(`[data-check="${key}"]`);
      li.classList.toggle("done", done);
      li.querySelector("span").textContent = done ? "✓" : "○";
    });
    $("videoSummary").textContent = state.videoBlob ? "Ready (" + formatBytes(state.videoBlob.size) + ")" : "Not recorded";
    $("docsSummary").textContent = state.documents.length + " attached";
    $("submitBtn").disabled = !(Object.values(checks).every(Boolean)) || !state.accessCode;
  }
  function stopStream() {
    if (state.stream) state.stream.getTracks().forEach(track => track.stop());
    state.stream = null;
    $("liveVideo").srcObject = null;
    $("liveVideo").hidden = true;
    $("cameraEmpty").hidden = false;
    $("cameraDot").classList.remove("on");
    $("cameraStatus").textContent = "Camera stopped";
    $("startRecording").disabled = true;
  }
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $("cameraStatus").textContent = "Camera requires HTTPS or localhost in a supported browser.";
      return;
    }
    stopStream();
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: $("cameraFacing").value }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      $("liveVideo").srcObject = state.stream;
      $("liveVideo").hidden = false;
      $("cameraEmpty").hidden = true;
      $("cameraDot").classList.add("on");
      const settings = state.stream.getVideoTracks()[0].getSettings();
      $("cameraStatus").textContent = "Camera and microphone active" + (settings.facingMode ? " · " + settings.facingMode + " camera" : "");
      $("startRecording").disabled = false;
    } catch (error) {
      $("cameraStatus").textContent = "Camera/microphone permission failed. Allow access and try again.";
    }
  }
  function resetRecording() {
    if (state.recorder && state.recorder.state === "recording") state.recorder.stop();
    clearInterval(state.timer);
    state.videoBlob = null;
    state.chunks = [];
    $("recordedPreview").removeAttribute("src");
    $("recordedPreviewWrap").hidden = true;
    $("recordStatus").textContent = "No video recorded yet.";
    $("recordTimer").textContent = "00:00";
    updateChecklist();
  }
  function drawTimer() {
    const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
    $("recordTimer").textContent = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
  }
  function startRecording() {
    if (!state.stream) return;
    if (!window.MediaRecorder) {
      $("recordStatus").textContent = "This browser does not support video recording. Please use a recent Chrome or Edge browser.";
      return;
    }
    state.chunks = [];
    state.videoBlob = null;
    let options = {};
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) options.mimeType = "video/webm;codecs=vp9,opus";
    else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) options.mimeType = "video/webm;codecs=vp8,opus";
    try { state.recorder = new MediaRecorder(state.stream, options); }
    catch (error) { $("recordStatus").textContent = "Recording could not start. Try a supported browser."; return; }
    state.recorder.ondataavailable = event => { if (event.data && event.data.size) state.chunks.push(event.data); };
    state.recorder.onerror = () => { $("recordStatus").textContent = "A recording error occurred. Please try again."; };
    state.recorder.onstop = () => {
      const mime = state.recorder.mimeType || "video/webm";
      state.videoBlob = new Blob(state.chunks, { type: mime });
      if (!state.videoBlob.size) {
        state.videoBlob = null;
        $("recordStatus").textContent = "The recording was empty. Please record again.";
      } else {
        $("recordedPreview").src = URL.createObjectURL(state.videoBlob);
        $("recordedPreviewWrap").hidden = false;
        $("recordStatus").textContent = "Video ready · " + formatBytes(state.videoBlob.size) + ". Review it before submitting.";
      }
      $("startRecording").disabled = !state.stream;
      $("stopRecording").disabled = true;
      clearInterval(state.timer);
      updateChecklist();
    };
    state.recorder.start(1000);
    state.startedAt = Date.now();
    state.timer = setInterval(drawTimer, 500);
    $("startRecording").disabled = true;
    $("stopRecording").disabled = false;
    $("recordStatus").textContent = "Recording in progress. Read the code aloud and show your face clearly.";
  }
  function renderDocuments() {
    const list = $("documentList");
    list.replaceChildren();
    if (!state.documents.length) {
      const p = document.createElement("p");
      p.className = "empty-files";
      p.textContent = "No files selected.";
      list.appendChild(p);
    }
    state.documents.forEach((file, index) => {
      const row = document.createElement("div");
      row.className = "file-row";
      const left = document.createElement("div");
      left.className = "file-name";
      const name = document.createElement("strong");
      name.textContent = file.name;
      const meta = document.createElement("div");
      meta.className = "file-meta";
      meta.textContent = formatBytes(file.size) + " · " + (file.type || "file");
      left.append(name, meta);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-file";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove " + file.name);
      remove.addEventListener("click", () => {
        state.documents.splice(index, 1);
        renderDocuments();
        updateChecklist();
      });
      row.append(left, remove);
      list.appendChild(row);
    });
  }
  async function unlock() {
    const code = $("accessCode").value.trim();
    if (!code) { $("accessMessage").textContent = "Enter the access code provided by your organisation."; return; }
    $("unlockBtn").disabled = true;
    $("accessMessage").textContent = "Checking access…";
    try {
      const response = await fetch("/api/access-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Access denied.");
      state.accessCode = code;
      sessionStorage.setItem("odvpAccessCode", code);
      $("accessPanel").hidden = true;
      $("verificationForm").hidden = false;
      newCode();
      updateChecklist();
    } catch (error) {
      $("accessMessage").textContent = error.message || "Unable to verify access. Please try again.";
    } finally {
      $("unlockBtn").disabled = false;
    }
  }
  async function submit(event) {
    event.preventDefault();
    updateChecklist();
    if (!detailsComplete() || !state.videoBlob || !state.documents.length || !$("consent").checked || !$("declaration").checked) {
      setMessage("Please complete all required fields, record a video, attach documents, and confirm both declarations.", "error");
      return;
    }
    const submitBtn = $("submitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading evidence…";
    setMessage("Uploading your video and documents. Keep this page open until the upload finishes.");
    const formData = new FormData();
    formData.append("fullName", $("fullName").value.trim());
    formData.append("referenceId", $("referenceId").value.trim());
    formData.append("documentType", $("documentType").value);
    formData.append("purpose", $("purpose").value);
    formData.append("verificationCode", state.code);
    formData.append("consent", String($("consent").checked));
    formData.append("declaration", String($("declaration").checked));
    const videoExt = state.videoBlob.type.includes("mp4") ? "mp4" : "webm";
    formData.append("video", state.videoBlob, "verification-video." + videoExt);
    state.documents.forEach(file => formData.append("documents", file, file.name));
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "x-portal-access": state.accessCode },
        body: formData
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Submission failed.");
      state.receipt = result.submissionId;
      $("verificationForm").hidden = true;
      $("successPanel").hidden = false;
      $("receiptId").textContent = result.submissionId;
      $("downloadReceipt").onclick = () => {
        const receipt = `ONLINE DOCUMENT VERIFICATION PORTAL — RECEIPT\nSubmission reference: ${result.submissionId}\nApplicant: ${$("fullName").value.trim()}\nApplication reference: ${$("referenceId").value.trim()}\nSubmitted: ${new Date().toLocaleString()}\nStatus: ${result.status}\nKeep this receipt for follow-up.`;
        const blob = new Blob([receipt], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "verification-submission-receipt.txt"; a.click();
        URL.revokeObjectURL(url);
      };
      stopStream();
    } catch (error) {
      setMessage(error.message || "Could not submit. Check your connection and try again.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit for verification";
      updateChecklist();
    }
  }

  $("unlockBtn").addEventListener("click", unlock);
  $("accessCode").addEventListener("keydown", event => { if (event.key === "Enter") unlock(); });
  $("startCamera").addEventListener("click", startCamera);
  $("switchCamera").addEventListener("click", async () => {
    $("cameraFacing").value = $("cameraFacing").value === "user" ? "environment" : "user";
    if (state.stream) await startCamera();
  });
  $("cameraFacing").addEventListener("change", () => { if (state.stream) startCamera(); });
  $("startRecording").addEventListener("click", startRecording);
  $("stopRecording").addEventListener("click", () => { if (state.recorder && state.recorder.state === "recording") state.recorder.stop(); });
  $("refreshCode").addEventListener("click", () => {
    if (state.recorder && state.recorder.state === "recording") return;
    newCode();
  });
  $("redoRecording").addEventListener("click", () => {
    if (state.videoBlob) URL.revokeObjectURL($("recordedPreview").src);
    resetRecording();
  });
  $("documents").addEventListener("change", event => {
    const selected = Array.from(event.target.files || []);
    const combined = [...state.documents];
    for (const file of selected) {
      if (combined.length >= maxDocuments) { setMessage("You can attach a maximum of " + maxDocuments + " documents.", "error"); break; }
      if (file.size > maxFileSize) { setMessage(file.name + " is larger than the local 150 MB limit.", "error"); continue; }
      const duplicate = combined.some(existing => existing.name === file.name && existing.size === file.size);
      if (!duplicate) combined.push(file);
    }
    state.documents = combined;
    event.target.value = "";
    renderDocuments();
    updateChecklist();
  });
  ["fullName", "referenceId", "documentType", "purpose", "consent", "declaration"].forEach(id => $(id).addEventListener("input", updateChecklist));
  $("verificationForm").addEventListener("submit", submit);
  window.addEventListener("beforeunload", () => { if (state.stream) state.stream.getTracks().forEach(track => track.stop()); });

  // Keep access only in this tab's session. Ask again after a new session.
  const saved = sessionStorage.getItem("odvpAccessCode");
  if (saved) { $("accessCode").value = saved; unlock(); }
  updateChecklist();
})();