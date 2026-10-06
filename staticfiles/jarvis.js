(() => {
  const $ = (id) => document.getElementById(id);
  const hud = $("hud"), log = $("log"), input = $("input"), sendBtn = $("send");
  const core = $("core"), statusEl = $("status"), voiceBtn = $("voice"), handsBtn = $("hands");
  const micBtn = $("mic"), startBtn = $("start"), bar = $("bar");
  const TTS = "speechSynthesis" in window;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const BARS = '<span class="bars"><i></i><i></i><i></i><i></i><i></i></span>';
  const convo = [];
  let voiceOn = true, online = true, offlineLine = "", voice = null;
  let speaker = null, speaking = false;
  let rec = null, listening = false, heard = "", handsFree = false, misses = 0;
  try { voiceOn = localStorage.getItem("jarvis-voice") !== "off"; } catch (e) {}

  const csrf = () => (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";
  const setStatus = (t) => (statusEl.textContent = t);
  const idleStatus = () => setStatus(sendBtn.disabled ? "Processing" : listening ? "Listening"
    : speaking ? "Speaking" : online ? "Online" : "Server offline");

  function add(role, text) {
    const el = document.createElement("div");
    el.className = "msg " + role;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  function setOffline(off) {
    online = !off;
    core.classList.toggle("offline", off);
    idleStatus();
  }
  function setBusy(busy) {
    core.classList.toggle("thinking", busy);
    sendBtn.disabled = busy;
    idleStatus();
  }

  // --- Speech out: JARVIS starts talking as soon as the first sentence is ready ---
  function pickVoice() {
    const vs = speechSynthesis.getVoices();
    for (const p of [/daniel/i, /google uk english male/i, /george/i, /arthur/i, /oliver/i, /en-gb/i]) {
      const v = vs.find((v) => p.test(v.name) || p.test(v.lang));
      if (v) return (voice = v);
    }
    voice = vs.find((v) => /^en/i.test(v.lang)) || null;
  }
  if (TTS) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

  // SPLIT-START
  function takeSentences(buf) {
    const out = [];
    const re = /[.!?]["')\]]*\s+/g;
    let m, start = 0;
    while ((m = re.exec(buf))) {
      const end = m.index + m[0].length;
      if (end - start >= 10) { out.push(buf.slice(start, end).trim()); start = end; }
    }
    return [out, buf.slice(start)];
  }
  // SPLIT-END

  function makeSpeaker(onDone) {
    if (speaker) speaker.cancel();
    let buf = "", pending = 0, ended = false, finished = false;
    const s = { push, end, cancel };
    speaker = s;
    function finish() {
      if (finished) return;
      finished = true; speaking = false;
      core.classList.remove("speaking");
      if (speaker === s) speaker = null;
      idleStatus();
      if (onDone) onDone();
    }
    function check() { if (ended && pending === 0) finish(); }
    function say(text) {
      const t = text.replace(/[*_`#>]/g, "").trim();
      if (!t || !voiceOn || !TTS) return;
      const u = new SpeechSynthesisUtterance(t);
      if (voice) u.voice = voice;
      u.rate = 0.95; u.pitch = 0.85;
      pending++;
      u.onstart = () => { if (finished) return; speaking = true; core.classList.add("speaking"); idleStatus(); };
      u.onend = u.onerror = () => { pending--; check(); };
      speechSynthesis.speak(u);
    }
    function push(chunk) { buf += chunk; const [done, rest] = takeSentences(buf); buf = rest; done.forEach(say); }
    function end() { say(buf); buf = ""; ended = true; check(); }
    function cancel() {
      finished = true; ended = true; buf = ""; speaking = false;
      core.classList.remove("speaking");
      if (TTS) speechSynthesis.cancel();
      if (speaker === s) speaker = null;
    }
    return s;
  }
  function speak(text, onDone) { const s = makeSpeaker(onDone); s.push(text); s.end(); }

  function setVoice(on) {
    voiceOn = on;
    voiceBtn.setAttribute("aria-pressed", on);
    voiceBtn.textContent = on ? "Voice on" : "Voice off";
    try { localStorage.setItem("jarvis-voice", on ? "on" : "off"); } catch (e) {}
    if (!on) { if (speaker) speaker.cancel(); if (handsFree) setHandsFree(false); }
  }
  voiceBtn.addEventListener("click", () => setVoice(!voiceOn));
  setVoice(voiceOn);

  // --- Speech in: tap the mic once, or switch on hands-free for a back-and-forth conversation ---
  function startListening() {
    if (!SR || listening || sendBtn.disabled) return;
    if (speaker) speaker.cancel();
    rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    heard = "";
    rec.onresult = (e) => {
      heard = Array.from(e.results).map((r) => r[0].transcript).join(" ").trim();
      input.value = heard;
    };
    rec.onerror = (e) => {
      const msg = {
        "not-allowed": "Microphone access is blocked. Allow it for this site in your browser settings.",
        "service-not-allowed": "Speech recognition is switched off. On iPhone, enable Dictation in Settings, General, Keyboard.",
        "no-speech": "I didn't catch that. Tap the microphone and try again.",
      }[e.error];
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setHandsFree(false);
      if (msg && !(e.error === "no-speech" && handsFree)) add("jarvis error", msg);
    };
    rec.onend = () => {
      const said = heard;
      heard = "";
      listening = false;
      micBtn.classList.remove("listening");
      micBtn.setAttribute("aria-pressed", "false");
      core.classList.remove("listening");
      idleStatus();
      if (said) { misses = 0; send(); }
      else if (handsFree) {
        if (++misses >= 3) {
          setHandsFree(false);
          add("jarvis", "Standing by. Switch hands-free back on when you want to talk.");
        } else setTimeout(startListening, 300);
      }
    };
    try { rec.start(); } catch (e) { setHandsFree(false); return; }
    listening = true;
    micBtn.classList.add("listening");
    micBtn.setAttribute("aria-pressed", "true");
    core.classList.add("listening");
    idleStatus();
  }

  function setHandsFree(on) {
    if (on && !SR) return;
    handsFree = on; misses = 0;
    handsBtn.setAttribute("aria-pressed", on);
    handsBtn.textContent = on ? "Hands-free on" : "Hands-free off";
    if (on) { if (!voiceOn) setVoice(true); startListening(); }
    else if (listening && rec) { heard = ""; rec.abort(); }
  }

  if (SR) {
    micBtn.hidden = false;
    handsBtn.hidden = false;
    micBtn.addEventListener("click", () => {
      if (!listening) startListening();
      else if (handsFree) setHandsFree(false);
      else rec.stop();
    });
    handsBtn.addEventListener("click", () => setHandsFree(!handsFree));
  }

  // --- Chat: the reply streams in word by word and is spoken as it arrives ---
  const afterReply = () => { if (handsFree) setTimeout(startListening, 400); };

  async function send() {
    const text = input.value.trim();
    if (!text || sendBtn.disabled) return;
    input.value = "";
    input.style.height = "auto";
    add("user", text);
    convo.push({ role: "user", content: text });
    const bubble = add("jarvis thinking", "");
    bubble.innerHTML = BARS + "Processing";
    setBusy(true);
    let full = "", sp = null;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
        body: JSON.stringify({ messages: convo }),
      });
      if (res.status === 401) { location.href = "/login"; return; }

      if (!(res.headers.get("Content-Type") || "").includes("ndjson")) {
        const data = await res.json();   // an error, or the "server is down" line
        bubble.remove();
        if (!res.ok) throw new Error(data.error || "Request failed.");
        if (data.offline) { convo.pop(); setOffline(true); setHandsFree(false); }
        else { convo.push({ role: "assistant", content: data.reply }); setOffline(false); }
        add("jarvis", data.reply);
        speak(data.reply, afterReply);
        return;
      }

      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "";
      sp = makeSpeaker(afterReply);
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const m = JSON.parse(line);
          if (m.error) throw new Error(m.error);
          if (!full) { bubble.className = "msg jarvis streaming"; bubble.textContent = ""; setOffline(false); }
          full += m.t;
          bubble.textContent = full;
          log.scrollTop = log.scrollHeight;
          sp.push(m.t);
        }
      }
      if (!full) throw new Error("JARVIS had nothing to say. Try again.");
      bubble.classList.remove("streaming");
      convo.push({ role: "assistant", content: full });
      sp.end();
    } catch (err) {
      bubble.classList.remove("streaming");
      if (full) { convo.push({ role: "assistant", content: full }); if (sp) sp.end(); }  // keep what arrived
      else { bubble.remove(); convo.pop(); if (sp) sp.cancel(); }
      add("jarvis error", err instanceof TypeError ? "Can't reach the JARVIS web server." : err.message);
      setHandsFree(false);
    } finally {
      setBusy(false);
      if (matchMedia("(pointer: fine)").matches) input.focus();
    }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
  });

  // --- Boot: loading animation, then a tap (which lets the browser play speech) ---
  core.classList.add("thinking");
  ["Initialising", "Calibrating core", "Linking language model"].forEach((s, i) =>
    setTimeout(() => setStatus(s), i * 750));
  requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add("full")));

  const statusReq = fetch("/api/status").then((r) => r.json()).catch(() => ({ online: false }));
  Promise.all([statusReq, new Promise((r) => setTimeout(r, 2300))]).then(([d]) => {
    online = d.online;
    offlineLine = d.reply || "";
    core.classList.remove("thinking");
    core.classList.toggle("offline", !online);
    setStatus(online ? "Ready" : "Server offline");
    hud.classList.add("ready");
    startBtn.focus();
  });

  startBtn.addEventListener("click", () => {
    hud.classList.remove("booting", "ready");
    idleStatus();
    const h = new Date().getHours();
    const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
    const line = online
      ? `Good ${part}. All systems are nominal. How can I help?`
      : offlineLine || "The language server is offline. Please start Ollama and reload.";
    add("jarvis", line);
    speak(line);
    if (matchMedia("(pointer: fine)").matches) input.focus();
  });
})();
