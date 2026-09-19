const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const PROMPTS = {
  "Content creation": [
    "What is one content rule you think creators should stop following?",
    "Explain how you would grow a new page from zero today.",
    "What makes you stop scrolling in the first three seconds?",
    "Describe a creator you learn from and what they do differently.",
    "Pitch a video idea you believe could go viral."
  ],
  "Interview": [
    "Tell me about yourself without listing your resume.",
    "Describe a time you solved a problem under pressure.",
    "What is one weakness you are actively improving?",
    "Why should someone choose you for an opportunity?",
    "Explain a project you are proud of and your exact role in it."
  ],
  "Storytelling": [
    "Tell a story about a small decision that changed your day.",
    "Describe your most memorable first day somewhere.",
    "Tell a story about a time you were completely wrong.",
    "Describe a moment you felt proud of yourself.",
    "Turn an ordinary trip outside into a dramatic 60-second story."
  ],
  "Opinion": [
    "What is one skill everyone should learn before they turn 20?",
    "Is consistency more important than talent? Defend your answer.",
    "What is a popular productivity habit you disagree with?",
    "Should people share their goals publicly or keep them private?",
    "What does success mean to you right now?"
  ],
  "Business": [
    "Pitch a simple business you could start with almost no money.",
    "Explain why a customer should pay more for a premium service.",
    "What makes an online product trustworthy?",
    "Pitch yourself to a client in 60 seconds.",
    "Describe one bad business habit that kills growth."
  ],
  "Fun": [
    "If your phone could expose one secret habit, what would it reveal?",
    "Convince me that your favorite snack deserves a luxury version.",
    "Invent a useless app and pitch it seriously.",
    "If you could swap lives with any fictional character for a day, who and why?",
    "Explain the internet to someone from the year 1900."
  ],
  "History": [
    "Which historical invention changed everyday life the most?",
    "Explain one historical event you wish more people understood.",
    "If you could interview one person from history, who would it be and what would you ask?",
    "Describe how one old invention still affects your life today.",
    "Which period of history would make the best video game setting?"
  ],
  "Networking": [
    "Introduce yourself to someone you admire in under 30 seconds.",
    "Ask a stranger for advice without sounding transactional.",
    "Explain what you do in a way a ten-year-old could understand.",
    "Make a confident request for a collaboration.",
    "Follow up after meeting someone at an event."
  ]
};

const CHALLENGES = [
  { title: "No filler words", prompt: "Explain your morning routine without using um, uh, like, or basically.", duration: 60, category: "Fun", xp: 20 },
  { title: "Strong opening", prompt: "Give your opinion on whether social media helps or hurts creativity. Start with a bold first sentence.", duration: 90, category: "Opinion", xp: 25 },
  { title: "Mini story", prompt: "Tell a complete story about a recent mistake with a setup, turning point, and ending.", duration: 120, category: "Storytelling", xp: 30 },
  { title: "Client pitch", prompt: "Pitch your strongest skill to a client who has never met you.", duration: 60, category: "Business", xp: 25 },
  { title: "Teach it simply", prompt: "Teach one topic you know well as if the listener is a complete beginner.", duration: 120, category: "Content creation", xp: 30 },
  { title: "Camera lens drill", prompt: "Talk about your biggest goal while looking toward the camera lens at the end of every sentence.", duration: 90, category: "Networking", xp: 25 }
];

const DEFAULT_PROFILE = {
  xp: 0,
  streak: 0,
  lastPracticeDate: null,
  history: [],
  aiPath: null
};

const state = {
  view: "dashboard",
  category: "Content creation",
  mode: "Off-the-cuff",
  duration: 60,
  prompt: "",
  topicReady: false,
  mediaStream: null,
  mediaRecorder: null,
  recordedChunks: [],
  recordingUrl: null,
  recognition: null,
  finalTranscript: "",
  interimTranscript: "",
  startedAt: 0,
  timerId: null,
  meterId: null,
  faceId: null,
  audioContext: null,
  analyser: null,
  audioSamples: [],
  faceSamples: [],
  pauseCount: 0,
  lastSpokenAt: 0,
  pauseArmed: false,
  snapshots: [],
  captureMilestones: [0.12, 0.30, 0.48, 0.66, 0.84],
  capturedMilestones: new Set(),
  running: false,
  rawMetrics: null,
  analysis: null,
  aiEnabled: null,
  activeChallenge: null,
  profile: loadProfile(),
  live: {
    socket: null,
    pc: null,
    stream: null,
    roomId: null,
    role: null,
    timerId: null,
    matched: false
  }
};

function loadProfile() {
  try {
    const newer = localStorage.getItem("spokify-profile-v3");
    const legacy = localStorage.getItem("spokyfy-profile-v2");
    const raw = JSON.parse(newer || legacy || "null");
    const profile = {
      ...DEFAULT_PROFILE,
      ...(raw || {}),
      history: Array.isArray(raw && raw.history) ? raw.history : [],
      aiPath: raw && raw.aiPath ? raw.aiPath : null
    };
    if (!newer && legacy) {
      localStorage.setItem("spokify-profile-v3", JSON.stringify(profile));
    }
    return profile;
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function saveProfile() {
  localStorage.setItem("spokify-profile-v3", JSON.stringify(state.profile));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return mins + ":" + secs;
}

function levelFromXp(xp) {
  return Math.min(50, Math.floor(Math.max(0, xp) / 250) + 1);
}

function levelName(level) {
  if (level < 5) return "Warm-up";
  if (level < 10) return "Finding your voice";
  if (level < 20) return "Clear speaker";
  if (level < 30) return "Camera confident";
  if (level < 40) return "Strong communicator";
  if (level < 50) return "Natural presenter";
  return "Spokify master";
}

function xpProgress(xp) {
  if (levelFromXp(xp) >= 50) return { current: 250, needed: 250, pct: 100 };
  const current = xp % 250;
  return { current, needed: 250, pct: (current / 250) * 100 };
}


async function readApiJson(response, label = "API") {
  const raw = await response.text();
  let data = {};

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      const looksLikeHtml = /^\s*</.test(raw);
      const message = looksLikeHtml
        ? label + " returned a webpage instead of JSON. Your Node backend/API is probably not running on this deployment."
        : label + " returned an invalid response: " + raw.slice(0, 180);
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
  }

  if (!response.ok) {
    const message =
      data && data.error
        ? data.error
        : label + " failed with HTTP " + response.status + (raw ? "." : " and returned an empty response.");
    const error = new Error(message);
    error.status = response.status;
    error.details = data && data.detail ? data.detail : "";
    throw error;
  }

  if (!raw) {
    const error = new Error(
      label + " returned an empty response. The backend may have crashed, timed out, or is not deployed."
    );
    error.status = response.status;
    throw error;
  }

  return data;
}


function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function setView(view) {
  state.view = view;
  $$(".view").forEach((el) => el.classList.toggle("active", el.id === "view-" + view));
  $$(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  const titles = {
    dashboard: "Build confidence one rep at a time.",
    practice: "Practice like the camera is already live.",
    live: "Get comfortable speaking to real people.",
    challenges: "Turn your fear into a challenge path.",
    progress: "Watch your reps compound."
  };
  $("#pageTitle").textContent = titles[view] || titles.dashboard;
  if (view === "progress") renderProgress();
  if (view === "challenges") renderChallenges();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderProfile() {
  const xp = state.profile.xp || 0;
  const level = levelFromXp(xp);
  const progress = xpProgress(xp);
  const history = state.profile.history || [];
  const last = history.find((item) => Number.isFinite(Number(item.overall)));

  $("#sideLevel").textContent = level;
  $("#sideLevelName").textContent = levelName(level);
  $("#sideXpBar").style.width = progress.pct + "%";
  $("#sideXpText").textContent = progress.current + " / " + progress.needed + " XP";
  $("#streakText").textContent = (state.profile.streak || 0) + " day streak";

  $("#dashStreak").textContent = state.profile.streak || 0;
  $("#dashLevel").textContent = String(level).padStart(2, "0");
  $("#dashLevelName").textContent = levelName(level);
  $("#dashXpBar").style.width = progress.pct + "%";
  $("#dashXpCurrent").textContent = progress.current + " XP";
  $("#dashXpNext").textContent = progress.needed + " XP";
  $("#dashReps").textContent = history.length;
  $("#dashScore").textContent = last ? last.overall : "—";
  $("#dashScoreText").textContent = last
    ? "Last AI-scored rep · " + last.category + " · " + last.wpm + " WPM"
    : "Complete your first AI-scored rep to unlock feedback.";
}

function updateStreak() {
  const today = new Date();
  const key = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  if (state.profile.lastPracticeDate === key) return;

  if (!state.profile.lastPracticeDate) {
    state.profile.streak = 1;
  } else {
    const prev = new Date(state.profile.lastPracticeDate + "T00:00:00");
    const current = new Date(key + "T00:00:00");
    const days = Math.round((current - prev) / 86400000);
    state.profile.streak = days === 1 ? (state.profile.streak || 0) + 1 : 1;
  }
  state.profile.lastPracticeDate = key;
}

function setTopicWaiting() {
  state.topicReady = false;
  state.prompt = "";
  $("#practicePrompt").textContent = "Category selected. Tap Spin Topic to get a prompt.";
  $("#spinHint").textContent = state.category + " selected";
  $("#outlineBox").classList.add("hidden");
  $("#outlineBox").innerHTML = "";
  $("#scriptBox").classList.add("hidden");
  $("#scriptBox").textContent = "";
}

async function spinPrompt() {
  if (state.running) return;
  const list = PROMPTS[state.category] || PROMPTS["Content creation"];
  const btn = $("#spinPromptBtn");
  const box = $(".spin-result");
  btn.disabled = true;
  btn.classList.add("spinning");

  for (let i = 0; i < 9; i += 1) {
    $("#practicePrompt").textContent = list[Math.floor(Math.random() * list.length)];
    await new Promise((resolve) => setTimeout(resolve, 60 + i * 14));
  }

  let next = list[Math.floor(Math.random() * list.length)];
  if (next === state.prompt && list.length > 1) {
    next = list[(list.indexOf(next) + 1) % list.length];
  }
  state.prompt = next;
  state.topicReady = true;
  $("#practicePrompt").textContent = next;
  $("#spinHint").textContent = "Spin again for another " + state.category + " topic";
  btn.classList.remove("spinning");
  btn.disabled = false;
  box.classList.add("flash");
  setTimeout(() => box.classList.remove("flash"), 500);
  $("#outlineBox").classList.add("hidden");
  $("#scriptBox").classList.add("hidden");
}

function syncSetupUI() {
  $("#practicePrompt").textContent = state.topicReady ? state.prompt : "Choose a category above, then tap Spin Topic.";
  $("#timerPill").textContent = formatTime(state.duration);
  $("#spinHint").textContent = state.topicReady
    ? "Spin again for another " + state.category + " topic"
    : state.category + " selected";
}

async function getOutline() {
  if (!state.topicReady) return toast("Spin a topic first.");
  const btn = $("#outlineBtn");
  btn.disabled = true;
  btn.textContent = "Building outline…";
  try {
    const response = await fetch("/api/outline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: state.prompt })
    });
    const data = await readApiJson(response, "Spokify AI outline");

    const box = $("#outlineBox");
    box.innerHTML = "";
    (data.outline || []).forEach((line, index) => {
      const p = document.createElement("p");
      p.textContent = (index + 1) + ". " + line;
      box.appendChild(p);
    });
    box.classList.remove("hidden");
  } catch (error) {
    toast(error.message || "Could not build an outline.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Give me a 3-point outline";
  }
}

async function getScript() {
  if (!state.topicReady) return toast("Spin a topic first.");
  const btn = $("#scriptBtn");
  btn.disabled = true;
  btn.textContent = "Writing sample…";
  try {
    const response = await fetch("/api/script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: state.prompt })
    });
    const data = await readApiJson(response, "Spokify AI sample");
    $("#scriptBox").textContent = data.script || "No sample available.";
    $("#scriptBox").classList.remove("hidden");
  } catch (error) {
    toast(error.message || "Could not generate a sample answer.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Show a sample answer";
  }
}

async function ensureMedia() {
  if (state.mediaStream && state.mediaStream.active) return state.mediaStream;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Camera access is not supported in this browser.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  state.mediaStream = stream;
  $("#cameraVideo").srcObject = stream;
  $("#cameraPlaceholder").classList.add("hidden");
  return stream;
}

function resetScoreUI() {
  const ids = [
    "confidence", "clarity", "fluency", "eyeContact",
    "expression", "postureFraming", "voiceDelivery"
  ];
  $("#overallScore").textContent = "—";
  ids.forEach((id) => {
    $("#" + id + "Score").textContent = "—";
    $("#" + id + "Bar").style.width = "0%";
    $("#" + id + "Evidence").textContent = "";
  });
  $("#analysisError").classList.add("hidden");
  $("#analysisError").textContent = "";
  $("#challengeResult").className = "challenge-result hidden";
  $("#challengeResult").textContent = "";
  $("#coachSummary").textContent = "Reviewing your performance…";
  $("#nextDrill").textContent = "Loading…";
  $("#contentFeedback").textContent = "";
  $("#visualFeedback").textContent = "—";
  $("#voiceFeedback").textContent = "—";
  $("#strengthList").innerHTML = "";
  $("#improvementList").innerHTML = "";
}

function resetSession() {
  clearInterval(state.timerId);
  clearInterval(state.meterId);
  clearInterval(state.faceId);
  state.running = false;
  state.recordedChunks = [];
  state.finalTranscript = "";
  state.interimTranscript = "";
  state.audioSamples = [];
  state.faceSamples = [];
  state.pauseCount = 0;
  state.lastSpokenAt = 0;
  state.pauseArmed = false;
  state.snapshots = [];
  state.capturedMilestones = new Set();
  state.rawMetrics = null;
  state.analysis = null;
  $("#wordCounter").textContent = "0 words";
  $("#liveTranscript").textContent = "Your transcript will appear here while you speak.";
  $("#recordingIndicator").classList.add("hidden");
  $("#finishPracticeBtn").classList.add("hidden");
  $("#startPracticeBtn").classList.remove("hidden");
  $("#resultsPanel").classList.add("hidden");
  $("#playbackVideo").classList.add("hidden");
  $("#downloadRecordingBtn").classList.add("hidden");
  $("#timerPill").textContent = formatTime(state.duration);
  $("#audioMeter").style.width = "0%";
  $("#practiceAgainBtn").textContent = "Do another rep →";
  resetScoreUI();
}

function startSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    state.recognition = null;
    $("#liveTranscript").textContent = "Live transcription is not supported in this browser. AI can still review visual evidence and raw delivery metrics, but transcript-based scoring will be limited.";
    return;
  }

  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";

  recognition.onresult = (event) => {
    let interim = "";
    let finalChunk = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalChunk += text + " ";
      else interim += text;
    }
    if (finalChunk) state.finalTranscript += finalChunk;
    state.interimTranscript = interim;
    state.lastSpokenAt = performance.now();
    state.pauseArmed = true;
    const visible = (state.finalTranscript + state.interimTranscript).trim();
    $("#liveTranscript").textContent = visible || "Listening…";
    $("#wordCounter").textContent = countWords(visible) + " words";
  };

  recognition.onerror = (event) => {
    if (event.error !== "no-speech" && event.error !== "aborted") {
      console.warn("Speech recognition:", event.error);
    }
  };

  recognition.onend = () => {
    if (state.running) {
      try { recognition.start(); } catch {}
    }
  };

  state.recognition = recognition;
  try { recognition.start(); } catch {}
}

function countWords(text) {
  return (text.trim().match(/\b[\w'’-]+\b/g) || []).length;
}

function startAudioMeter(stream) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  state.audioContext = new AudioCtx();
  const source = state.audioContext.createMediaStreamSource(stream);
  const analyser = state.audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  state.analyser = analyser;
  const data = new Uint8Array(analyser.fftSize);

  state.meterId = setInterval(() => {
    if (!state.running) return;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const normalized = (data[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    state.audioSamples.push(rms);
    $("#audioMeter").style.width = clamp(rms * 550, 2, 100) + "%";

    if (state.pauseArmed && state.lastSpokenAt && performance.now() - state.lastSpokenAt > 1500) {
      state.pauseCount += 1;
      state.pauseArmed = false;
    }
  }, 150);
}

function captureSnapshot() {
  const video = $("#cameraVideo");
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  const maxWidth = 640;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.56);
}

function startFaceSampling() {
  if (!("FaceDetector" in window)) return;
  let detector;
  try {
    detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
  } catch {
    return;
  }

  state.faceId = setInterval(async () => {
    if (!state.running || $("#cameraVideo").readyState < 2) return;
    try {
      const faces = await detector.detect($("#cameraVideo"));
      if (!faces.length) {
        state.faceSamples.push({ visible: 0, centered: 0 });
        return;
      }
      const box = faces[0].boundingBox;
      const video = $("#cameraVideo");
      const cx = (box.x + box.width / 2) / video.videoWidth;
      const cy = (box.y + box.height / 2) / video.videoHeight;
      const centered = Math.abs(cx - 0.5) < 0.2 && Math.abs(cy - 0.46) < 0.25 ? 1 : 0;
      state.faceSamples.push({ visible: 1, centered });
    } catch {}
  }, 700);
}

function startRecorder(stream) {
  if (!window.MediaRecorder) return;
  let options = {};
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) options.mimeType = "video/webm;codecs=vp9,opus";
  else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) options.mimeType = "video/webm;codecs=vp8,opus";

  try {
    state.mediaRecorder = new MediaRecorder(stream, options);
    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size) state.recordedChunks.push(event.data);
    };
    state.mediaRecorder.onstop = () => {
      if (!state.recordedChunks.length) return;
      if (state.recordingUrl) URL.revokeObjectURL(state.recordingUrl);
      const blob = new Blob(state.recordedChunks, { type: state.recordedChunks[0].type || "video/webm" });
      state.recordingUrl = URL.createObjectURL(blob);
      $("#playbackVideo").src = state.recordingUrl;
      $("#downloadRecordingBtn").href = state.recordingUrl;
      $("#downloadRecordingBtn").classList.remove("hidden");
    };
    state.mediaRecorder.start(500);
  } catch (error) {
    console.warn("Recorder unavailable", error);
  }
}

async function countdown() {
  const el = $("#countdown");
  el.classList.remove("hidden");
  for (const value of ["3", "2", "1", "GO"]) {
    el.textContent = value;
    await new Promise((resolve) => setTimeout(resolve, value === "GO" ? 450 : 650));
  }
  el.classList.add("hidden");
}

async function startPractice() {
  if (state.running) return;
  if (!state.topicReady || !state.prompt) {
    toast("Choose a category and spin a topic first.");
    return;
  }

  $("#startPracticeBtn").disabled = true;
  try {
    const stream = await ensureMedia();
    resetSession();
    await countdown();

    state.running = true;
    state.startedAt = performance.now();
    $("#stageHeading").textContent = state.activeChallenge
      ? "Challenge in progress. Meet the success rule."
      : "Speak. Do not chase perfection.";
    $("#recordingIndicator").classList.remove("hidden");
    $("#startPracticeBtn").classList.add("hidden");
    $("#startPracticeBtn").disabled = false;
    $("#finishPracticeBtn").classList.remove("hidden");

    startRecorder(stream);
    startSpeechRecognition();
    startAudioMeter(stream);
    startFaceSampling();

    const first = captureSnapshot();
    if (first) state.snapshots.push(first);

    state.timerId = setInterval(() => {
      const elapsed = (performance.now() - state.startedAt) / 1000;
      const remaining = state.duration - elapsed;
      $("#timerPill").textContent = formatTime(remaining);

      const fraction = elapsed / state.duration;
      state.captureMilestones.forEach((milestone, index) => {
        if (fraction >= milestone && !state.capturedMilestones.has(index) && state.snapshots.length < 6) {
          const frame = captureSnapshot();
          if (frame) state.snapshots.push(frame);
          state.capturedMilestones.add(index);
        }
      });

      if (remaining <= 0) finishPractice();
    }, 200);
  } catch (error) {
    $("#startPracticeBtn").disabled = false;
    toast(error.message || "Camera permission was not granted.");
  }
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (!values.length) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => Math.pow(value - mean, 2))));
}

function computeRawMetrics(elapsedSeconds) {
  const transcript = (state.finalTranscript + " " + state.interimTranscript).trim();
  const words = countWords(transcript);
  const minutes = Math.max(elapsedSeconds / 60, 0.1);
  const wpm = Math.round(words / minutes);

  const fillers = ["um", "uh", "erm", "like", "basically", "actually", "literally", "you know", "i mean", "sort of", "kind of"];
  let fillerCount = 0;
  const lower = " " + transcript.toLowerCase().replace(/[.,!?;:]/g, " ") + " ";
  fillers.forEach((filler) => {
    const matches = lower.match(new RegExp("\\b" + filler + "\\b", "g"));
    fillerCount += matches ? matches.length : 0;
  });

  const activeSamples = state.audioSamples.filter((v) => v > 0.018).length;
  const voiceActivity = state.audioSamples.length ? (activeSamples / state.audioSamples.length) * 100 : 0;
  const avgVolume = average(state.audioSamples);
  const volumeStdDev = standardDeviation(state.audioSamples);

  const faceVisible = state.faceSamples.length
    ? average(state.faceSamples.map((sample) => sample.visible)) * 100
    : null;
  const centered = state.faceSamples.length
    ? average(state.faceSamples.map((sample) => sample.centered)) * 100
    : null;

  return {
    elapsedSeconds: Math.round(elapsedSeconds),
    targetSeconds: state.duration,
    completionPercent: Math.round(clamp(elapsedSeconds / state.duration, 0, 1) * 100),
    wordCount: words,
    wpm,
    fillerCount,
    fillerRatePercent: words ? Number(((fillerCount / words) * 100).toFixed(1)) : 0,
    longPauses: state.pauseCount,
    voiceActivityPercent: Number(voiceActivity.toFixed(1)),
    averageRmsVolume: Number(avgVolume.toFixed(4)),
    volumeStdDev: Number(volumeStdDev.toFixed(4)),
    faceVisiblePercent: faceVisible === null ? null : Math.round(faceVisible),
    centeredFramingPercent: centered === null ? null : Math.round(centered),
    faceDetectorAvailable: Boolean(state.faceSamples.length),
    transcriptAvailable: Boolean(transcript)
  };
}

function renderRawMetrics(metrics) {
  $("#metricWords").textContent = metrics.wordCount;
  $("#metricWpm").textContent = metrics.wpm;
  $("#metricFillers").textContent = metrics.fillerCount;
  $("#metricPauses").textContent = metrics.longPauses;
}

async function finishPractice() {
  if (!state.running) return;
  state.running = false;
  clearInterval(state.timerId);
  clearInterval(state.meterId);
  clearInterval(state.faceId);

  if (state.recognition) {
    try { state.recognition.stop(); } catch {}
  }
  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    try { state.mediaRecorder.stop(); } catch {}
  }
  if (state.audioContext && state.audioContext.state !== "closed") {
    state.audioContext.close().catch(() => {});
  }

  const elapsed = Math.max(1, (performance.now() - state.startedAt) / 1000);
  state.rawMetrics = computeRawMetrics(elapsed);
  renderRawMetrics(state.rawMetrics);

  $("#recordingIndicator").classList.add("hidden");
  $("#finishPracticeBtn").classList.add("hidden");
  $("#startPracticeBtn").classList.remove("hidden");
  $("#stageHeading").textContent = "Rep complete.";
  $("#timerPill").textContent = formatTime(Math.max(0, state.duration - elapsed));
  $("#resultsPanel").classList.remove("hidden");
  $("#analysisProvider").textContent = "ChatGPT API is reviewing transcript, delivery evidence and camera snapshots…";
  $("#resultsPanel").scrollIntoView({ behavior: "smooth", block: "start" });

  const transcript = (state.finalTranscript + " " + state.interimTranscript).trim();

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: state.prompt,
        category: state.category,
        mode: state.mode,
        transcript,
        rawMetrics: state.rawMetrics,
        frames: state.snapshots.slice(0, 6),
        challenge: state.activeChallenge
          ? { title: state.activeChallenge.title, successRule: state.activeChallenge.successRule }
          : null
      })
    });

    const data = await readApiJson(response, "Spokify AI analysis");

    state.analysis = data;
    renderAnalysis(data);
    applyChallengeResult(data);
    saveSession();
  } catch (error) {
    state.analysis = null;
    const detail = error && error.details ? " " + error.details : "";
    renderAnalysisError((error.message || "AI analysis failed.") + detail);
  }
}

function renderAnalysis(analysis) {
  const scoreMap = [
    ["confidence", analysis.scores.confidence],
    ["clarity", analysis.scores.clarity],
    ["fluency", analysis.scores.fluency],
    ["eyeContact", analysis.scores.eyeContact],
    ["expression", analysis.scores.expression],
    ["postureFraming", analysis.scores.postureFraming],
    ["voiceDelivery", analysis.scores.voiceDelivery]
  ];

  $("#analysisError").classList.add("hidden");
  $("#overallScore").textContent = analysis.overall;
  scoreMap.forEach(([id, value]) => {
    $("#" + id + "Score").textContent = value;
    $("#" + id + "Evidence").textContent = analysis.evidence && analysis.evidence[id] ? analysis.evidence[id] : "";
    setTimeout(() => { $("#" + id + "Bar").style.width = value + "%"; }, 50);
  });

  $("#analysisProvider").textContent =
    "AI-scored · " + (analysis.model || "OpenAI") + " · transcript + raw delivery data + " + state.snapshots.length + " camera snapshots";
  $("#coachSummary").textContent = analysis.summary || "Rep reviewed.";
  $("#nextDrill").textContent = analysis.nextDrill || "Repeat the same prompt with one focused improvement.";
  $("#contentFeedback").textContent = analysis.contentFeedback || "";
  $("#visualFeedback").textContent = analysis.visualFeedback || "No visual feedback returned.";
  $("#voiceFeedback").textContent = analysis.voiceFeedback || "No voice feedback returned.";

  const renderList = (selector, values) => {
    const list = $(selector);
    list.innerHTML = "";
    (values || []).forEach((value) => {
      const li = document.createElement("li");
      li.textContent = value;
      list.appendChild(li);
    });
  };
  renderList("#strengthList", analysis.strengths);
  renderList("#improvementList", analysis.improvements);
}

function renderAnalysisError(message) {
  resetScoreUI();
  $("#resultsPanel").classList.remove("hidden");
  $("#analysisProvider").textContent = "AI score unavailable — no fake fallback score was generated.";
  const errorBox = $("#analysisError");
  errorBox.textContent = message + " Check OPENAI_API_KEY on the server and retry the rep.";
  errorBox.classList.remove("hidden");
  $("#coachSummary").textContent = "This rep was not scored.";
  $("#nextDrill").textContent = "Fix the AI connection, then repeat the rep for a real score.";
  $("#contentFeedback").textContent = "Your raw word count, pace, filler and pause data are still shown above.";
  $("#practiceAgainBtn").textContent = state.activeChallenge ? "Retry this challenge →" : "Retry rep →";
}

function applyChallengeResult(analysis) {
  const box = $("#challengeResult");
  if (!state.activeChallenge) {
    box.className = "challenge-result hidden";
    return;
  }

  const path = state.profile.aiPath;
  const completed = new Set(path && Array.isArray(path.completedIds) ? path.completedIds : []);

  if (analysis.challengePassed) {
    completed.add(state.activeChallenge.id);
    if (path) {
      path.completedIds = Array.from(completed);
      state.profile.aiPath = path;
      saveProfile();
    }
    box.className = "challenge-result pass";
    box.textContent = "✓ Challenge passed. " + (analysis.challengeFeedback || "The next task is now unlocked.");
    $("#practiceAgainBtn").textContent = "Go to next challenge →";
    toast("Challenge passed · next task unlocked");
  } else {
    box.className = "challenge-result retry";
    box.textContent = "↻ Not passed yet. " + (analysis.challengeFeedback || "Retry this task using the AI feedback.");
    $("#practiceAgainBtn").textContent = "Retry this challenge →";
  }
}

function saveSession() {
  if (!state.analysis || !state.rawMetrics) return;

  updateStreak();
  const overall = Number(state.analysis.overall) || 0;
  const baseXp = Math.max(25, Math.round(overall * 0.7));
  const durationBonus = Math.min(20, Math.round(state.rawMetrics.elapsedSeconds / 30) * 3);
  const challengeBonus = state.activeChallenge && state.analysis.challengePassed ? 25 : 0;
  const earnedXp = baseXp + durationBonus + challengeBonus;
  state.profile.xp = (state.profile.xp || 0) + earnedXp;

  state.profile.history.unshift({
    id: Date.now(),
    date: new Date().toISOString(),
    category: state.category,
    mode: state.mode,
    prompt: state.prompt,
    duration: state.rawMetrics.elapsedSeconds,
    overall,
    confidence: state.analysis.scores.confidence,
    clarity: state.analysis.scores.clarity,
    fluency: state.analysis.scores.fluency,
    eyeContact: state.analysis.scores.eyeContact,
    expression: state.analysis.scores.expression,
    postureFraming: state.analysis.scores.postureFraming,
    voiceDelivery: state.analysis.scores.voiceDelivery,
    wpm: state.rawMetrics.wpm,
    words: state.rawMetrics.wordCount,
    fillers: state.rawMetrics.fillerCount,
    xp: earnedXp,
    challengeId: state.activeChallenge ? state.activeChallenge.id : null,
    challengePassed: state.activeChallenge ? Boolean(state.analysis.challengePassed) : null
  });
  state.profile.history = state.profile.history.slice(0, 100);
  saveProfile();
  renderProfile();
  toast("AI-scored rep saved · +" + earnedXp + " XP");
}

async function generateFearPlan() {
  const fear = $("#fearInput").value.trim();
  if (!fear) return toast("Write your speaking or camera fear first.");

  const btn = $("#fearPlanBtn");
  const status = $("#fearStatus");
  btn.disabled = true;
  btn.textContent = "AI is building…";
  status.textContent = "Creating a progressive 6-step path…";

  try {
    const response = await fetch("/api/fear-challenges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fear })
    });
    const data = await readApiJson(response, "Spokify AI challenge builder");

    state.profile.aiPath = {
      fear,
      title: data.plan.title,
      intro: data.plan.intro,
      challenges: data.plan.challenges,
      completedIds: [],
      createdAt: new Date().toISOString()
    };
    saveProfile();
    renderAiPath();
    status.textContent = "Path created. Task 1 is unlocked.";
    toast("Your AI challenge path is ready.");
  } catch (error) {
    status.textContent = error.message || "Could not create the path.";
    toast(status.textContent);
  } finally {
    btn.disabled = false;
    btn.textContent = "Ask AI →";
  }
}

function resetAiPath() {
  state.profile.aiPath = null;
  state.activeChallenge = null;
  saveProfile();
  $("#fearInput").value = "";
  $("#fearStatus").textContent = "Your challenge path is saved on this device.";
  renderAiPath();
}

function startAiChallenge(challenge) {
  state.activeChallenge = challenge;
  state.category = challenge.category;
  state.duration = challenge.duration;
  state.mode = "Off-the-cuff";
  state.prompt = challenge.prompt;
  state.topicReady = true;
  syncSetupControls();
  $("#spinHint").textContent = "AI challenge topic locked";
  setView("practice");
  toast("Challenge loaded · " + challenge.title);
}

function renderAiPath() {
  const section = $("#aiPathSection");
  const grid = $("#aiChallengeGrid");
  const path = state.profile.aiPath;

  if (!path || !Array.isArray(path.challenges) || !path.challenges.length) {
    section.classList.add("hidden");
    grid.innerHTML = "";
    return;
  }

  section.classList.remove("hidden");
  $("#aiPathTitle").textContent = path.title || "Your challenge path";
  $("#aiPathIntro").textContent = path.intro || "";
  $("#fearInput").value = path.fear || "";

  const completed = new Set(Array.isArray(path.completedIds) ? path.completedIds : []);
  grid.innerHTML = "";

  path.challenges.forEach((challenge, index) => {
    const isCompleted = completed.has(challenge.id);
    const previousCompleted = index === 0 || completed.has(path.challenges[index - 1].id);
    const unlocked = isCompleted || previousCompleted;

    const card = document.createElement("article");
    card.className = "challenge-card" + (isCompleted ? " completed" : "") + (!unlocked ? " locked" : "");
    card.innerHTML =
      '<span class="num">STEP ' + (index + 1) + " / " + path.challenges.length + "</span>" +
      "<h3></h3><p class=\"challenge-description\"></p>" +
      '<div class="success-rule"></div>' +
      '<div class="lock-state"></div>' +
      '<button class="secondary-button"></button>';

    $("h3", card).textContent = challenge.title;
    $(".challenge-description", card).textContent = challenge.description + " · " + challenge.duration + " sec";
    $(".success-rule", card).textContent = "Pass rule: " + challenge.successRule;
    $(".lock-state", card).textContent = isCompleted ? "✓ Completed" : unlocked ? "● Unlocked" : "🔒 Complete the previous task first";

    const button = $("button", card);
    button.textContent = isCompleted ? "Practice again" : unlocked ? "Start task" : "Locked";
    button.disabled = !unlocked;
    if (unlocked) button.addEventListener("click", () => startAiChallenge(challenge));
    grid.appendChild(card);
  });
}

function renderChallenges() {
  renderAiPath();

  const grid = $("#challengeGrid");
  grid.innerHTML = "";
  CHALLENGES.forEach((challenge, index) => {
    const card = document.createElement("article");
    card.className = "challenge-card";
    card.innerHTML =
      '<span class="num">0' + (index + 1) + " · +" + challenge.xp + " XP</span>" +
      "<h3></h3><p></p><button class=\"secondary-button\">Start challenge</button>";
    $("h3", card).textContent = challenge.title;
    $("p", card).textContent = challenge.prompt + " · " + challenge.duration + " sec";
    $("button", card).addEventListener("click", () => {
      state.activeChallenge = null;
      state.category = challenge.category;
      state.duration = challenge.duration;
      state.prompt = challenge.prompt;
      state.topicReady = true;
      syncSetupControls();
      setView("practice");
    });
    grid.appendChild(card);
  });
}

function renderProgress() {
  const history = state.profile.history || [];
  const scored = history.filter((item) => Number.isFinite(Number(item.overall)));
  const level = levelFromXp(state.profile.xp || 0);
  const progress = xpProgress(state.profile.xp || 0);

  $("#progressLevel").textContent = String(level).padStart(2, "0");
  $("#progressLevelName").textContent = levelName(level);
  $("#progressXpBar").style.width = progress.pct + "%";
  $("#progressXpText").textContent = level >= 50
    ? "Maximum level reached"
    : (progress.needed - progress.current) + " XP until Level " + (level + 1);
  $("#bestScore").textContent = scored.length ? Math.max(...scored.map((item) => Number(item.overall) || 0)) : "—";
  $("#totalMinutes").textContent = Math.round(history.reduce((sum, item) => sum + (item.duration || 0), 0) / 60);
  $("#historyCount").textContent = history.length + " REPS";

  const chart = $("#scoreChart");
  chart.innerHTML = "";
  const recent = scored.slice(0, 10).reverse();
  if (!recent.length) {
    chart.innerHTML = '<div class="empty">Your AI score trend will appear after your first scored rep.</div>';
  } else {
    recent.forEach((item) => {
      const bar = document.createElement("div");
      bar.className = "chart-bar";
      bar.style.height = clamp(Number(item.overall) || 0, 10, 100) + "%";
      const label = document.createElement("span");
      label.textContent = item.overall;
      bar.appendChild(label);
      chart.appendChild(bar);
    });
  }

  const list = $("#historyList");
  list.innerHTML = "";
  if (!history.length) {
    list.innerHTML = '<div class="empty">No saved sessions yet. Do one camera rep and come back.</div>';
    return;
  }

  history.slice(0, 20).forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-item";
    const date = new Date(item.date);
    row.innerHTML =
      '<div class="history-score">' + (Number.isFinite(Number(item.overall)) ? item.overall : "—") + "</div>" +
      "<div><h4></h4><p></p></div>" +
      '<span class="history-meta">' + (item.wpm || 0) + " WPM</span>" +
      '<span class="history-meta">+' + (item.xp || 0) + " XP</span>";
    $("h4", row).textContent = item.prompt;
    $("p", row).textContent = item.category + " · " + date.toLocaleDateString() + " · " + Math.round(item.duration || 0) + " sec";
    list.appendChild(row);
  });
}

function syncSetupControls() {
  $$("#categoryChips .chip").forEach((btn) => btn.classList.toggle("active", btn.dataset.category === state.category));
  $$("#modePicker button").forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === state.mode));
  $$("#durationPicker button").forEach((btn) => btn.classList.toggle("active", Number(btn.dataset.duration) === state.duration));
  syncSetupUI();
}

async function shareResult() {
  if (!state.analysis || !state.rawMetrics) return toast("Complete an AI-scored rep first.");
  const text =
    "I scored " + state.analysis.overall + "/100 on my Spokify speaking rep — " +
    state.rawMetrics.wpm + " WPM, " + state.rawMetrics.fillerCount + " fillers. Camera confidence is a skill.";
  if (navigator.share) {
    try { await navigator.share({ title: "My Spokify result", text }); } catch {}
  } else {
    try {
      await navigator.clipboard.writeText(text);
      toast("Result copied to clipboard.");
    } catch {
      toast(text);
    }
  }
}

function playRecording() {
  if (!state.recordingUrl) return toast("Recording is not available in this browser.");
  const video = $("#playbackVideo");
  video.classList.remove("hidden");
  video.scrollIntoView({ behavior: "smooth", block: "center" });
  video.play().catch(() => {});
}

// ----- Live mode -----
async function liveMedia() {
  if (state.live.stream && state.live.stream.active) return state.live.stream;
  state.live.stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
    audio: { echoCancellation: true, noiseSuppression: true }
  });
  $("#liveLocalVideo").srcObject = state.live.stream;
  return state.live.stream;
}

function ensureSocket() {
  if (state.live.socket) return state.live.socket;
  const socket = io();
  state.live.socket = socket;

  socket.on("waiting", ({ role }) => {
    setLiveStatus("Waiting for a " + (role === "player" ? "Seeker" : "Player") + "…", false);
  });

  socket.on("matched", async ({ role, roomId, initiator }) => {
    state.live.role = role;
    state.live.roomId = roomId;
    state.live.matched = true;
    $("#liveRoom").classList.remove("hidden");
    setLiveStatus("Matched · " + role, true);
    await setupPeer(initiator);
  });

  socket.on("signal", async ({ data }) => {
    if (!state.live.pc || !data) return;
    try {
      if (data.type === "offer") {
        await state.live.pc.setRemoteDescription(data);
        const answer = await state.live.pc.createAnswer();
        await state.live.pc.setLocalDescription(answer);
        socket.emit("signal", { roomId: state.live.roomId, data: state.live.pc.localDescription });
      } else if (data.type === "answer") {
        await state.live.pc.setRemoteDescription(data);
      } else if (data.candidate) {
        await state.live.pc.addIceCandidate(data);
      }
    } catch (error) {
      console.warn("WebRTC signal error", error);
    }
  });

  socket.on("timer-started", ({ duration, startAt }) => startLiveTimer(duration, startAt));
  socket.on("rating-received", ({ rating }) => toast("Your partner rated this rep " + rating + "/5"));
  socket.on("partner-left", () => {
    toast("Your partner left the room.");
    leaveLive(false);
  });
  socket.on("live-error", ({ message }) => toast(message || "Live mode error"));
  return socket;
}

async function setupPeer(initiator) {
  const stream = await liveMedia();
  if (state.live.pc) state.live.pc.close();

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  state.live.pc = pc;
  stream.getTracks().forEach((track) => pc.addTrack(track, stream));

  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) $("#liveRemoteVideo").srcObject = event.streams[0];
  };
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      state.live.socket.emit("signal", { roomId: state.live.roomId, data: event.candidate });
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      setLiveStatus("Connected · " + state.live.role, true);
      if (state.live.role === "player") {
        state.live.socket.emit("start-timer", { roomId: state.live.roomId, duration: 90 });
      }
    }
  };

  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    state.live.socket.emit("signal", { roomId: state.live.roomId, data: pc.localDescription });
  }
}

function setLiveStatus(text, connected) {
  $("#liveStatus").textContent = text;
  $(".status-dot").classList.toggle("connected", Boolean(connected));
}

async function startLiveSearch(role) {
  try {
    await liveMedia();
    const socket = ensureSocket();
    state.live.role = role;
    $("#liveRoom").classList.remove("hidden");
    $("#ratingBox").classList.add("hidden");
    setLiveStatus("Finding a partner…", false);
    socket.emit("find-partner", { role });
  } catch {
    toast("Camera and microphone permission are required for Live mode.");
  }
}

function startLiveTimer(duration, startAt) {
  clearInterval(state.live.timerId);
  const render = () => {
    const elapsed = Math.max(0, (Date.now() - startAt) / 1000);
    const remaining = Math.max(0, duration - elapsed);
    $("#liveTimer").textContent = formatTime(remaining);
    if (remaining <= 0) {
      clearInterval(state.live.timerId);
      if (state.live.role === "seeker") $("#ratingBox").classList.remove("hidden");
      if (state.live.role === "player") toast("Round complete. Wait for your Seeker's rating.");
    }
  };
  render();
  state.live.timerId = setInterval(render, 250);
}

function leaveLive(emit = true) {
  clearInterval(state.live.timerId);
  if (emit && state.live.socket) state.live.socket.emit("leave-room");
  if (state.live.pc) state.live.pc.close();
  state.live.pc = null;
  state.live.roomId = null;
  state.live.matched = false;
  $("#liveRemoteVideo").srcObject = null;
  $("#liveRoom").classList.add("hidden");
  $("#ratingBox").classList.add("hidden");
  setLiveStatus("Not connected", false);
}

function bindEvents() {
  $$("[data-view]").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));

  ["#quickPracticeBtn", "#heroStartBtn"].forEach((selector) => {
    $(selector).addEventListener("click", () => {
      state.activeChallenge = null;
      setView("practice");
    });
  });

  $("#dailyStartBtn").addEventListener("click", () => {
    state.activeChallenge = null;
    state.category = "Opinion";
    state.mode = "Off-the-cuff";
    state.duration = 90;
    state.prompt = $("#dailyPrompt").textContent.trim();
    state.topicReady = true;
    syncSetupControls();
    setView("practice");
  });

  $$("#categoryChips .chip").forEach((btn) => btn.addEventListener("click", () => {
    state.activeChallenge = null;
    state.category = btn.dataset.category;
    $$("#categoryChips .chip").forEach((item) => item.classList.toggle("active", item === btn));
    setTopicWaiting();
  }));

  $$("#modePicker button").forEach((btn) => btn.addEventListener("click", () => {
    state.mode = btn.dataset.mode;
    $$("#modePicker button").forEach((item) => item.classList.toggle("active", item === btn));
  }));

  $$("#durationPicker button").forEach((btn) => btn.addEventListener("click", () => {
    state.duration = Number(btn.dataset.duration);
    $$("#durationPicker button").forEach((item) => item.classList.toggle("active", item === btn));
    $("#timerPill").textContent = formatTime(state.duration);
  }));

  $("#spinPromptBtn").addEventListener("click", spinPrompt);
  $("#outlineBtn").addEventListener("click", getOutline);
  $("#scriptBtn").addEventListener("click", getScript);
  $("#startPracticeBtn").addEventListener("click", startPractice);
  $("#finishPracticeBtn").addEventListener("click", finishPractice);

  $("#practiceAgainBtn").addEventListener("click", () => {
    if (state.activeChallenge) {
      if (state.analysis && state.analysis.challengePassed) {
        state.activeChallenge = null;
        resetSession();
        setView("challenges");
      } else {
        const challenge = state.activeChallenge;
        resetSession();
        state.prompt = challenge.prompt;
        state.topicReady = true;
        syncSetupControls();
        $("#setupPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    resetSession();
    setTopicWaiting();
    $("#setupPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("#playRecordingBtn").addEventListener("click", playRecording);
  $("#shareResultBtn").addEventListener("click", shareResult);

  $("#fearPlanBtn").addEventListener("click", generateFearPlan);
  $("#resetAiPathBtn").addEventListener("click", resetAiPath);

  $("#playerRoleBtn").addEventListener("click", () => startLiveSearch("player"));
  $("#seekerRoleBtn").addEventListener("click", () => startLiveSearch("seeker"));
  $("#leaveLiveBtn").addEventListener("click", () => leaveLive(true));
  $$("#ratingBox button").forEach((btn) => btn.addEventListener("click", () => {
    if (!state.live.socket || !state.live.roomId) return;
    const rating = Number(btn.dataset.rating);
    state.live.socket.emit("submit-rating", { roomId: state.live.roomId, rating });
    $("#ratingBox").classList.add("hidden");
    toast("Rating sent · " + rating + "/5");
  }));

  window.addEventListener("beforeunload", () => {
    if (state.live.socket) state.live.socket.emit("leave-room");
    [state.mediaStream, state.live.stream].forEach((stream) => {
      if (stream) stream.getTracks().forEach((track) => track.stop());
    });
  });
}

function init() {
  renderProfile();
  renderChallenges();
  renderProgress();
  syncSetupControls();
  bindEvents();

  fetch("/api/health")
    .then((response) => readApiJson(response, "Spokify backend"))
    .then((health) => {
      state.aiEnabled = Boolean(health.aiEnabled);
      if (!state.aiEnabled) {
        console.warn("Spokify AI scoring is disabled until OPENAI_API_KEY is configured.");
      }
    })
    .catch(() => {
      state.aiEnabled = false;
    });
}

init();
