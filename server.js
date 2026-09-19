const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public")));

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cleanString = (value, max = 6000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function responseText(data) {
  if (data && typeof data.output_text === "string") return data.output_text.trim();
  const output = Array.isArray(data && data.output) ? data.output : [];
  const parts = [];
  output.forEach((item) => {
    (item.content || []).forEach((content) => {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    });
  });
  return parts.join("\n").trim();
}

async function callOpenAI({ content, maxOutputTokens = 1400, format = null }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not configured.");
    error.code = "AI_NOT_CONFIGURED";
    throw error;
  }

  const model = process.env.OPENAI_MODEL || "gpt-6-astra";
  const body = {
    model,
    max_output_tokens: maxOutputTokens,
    store: false,
    input: [{ role: "user", content }]
  };
  if (format) body.text = { format };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.OPENAI_API_KEY
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data && data.error && data.error.message ? data.error.message : JSON.stringify(data);
    throw new Error("OpenAI request failed (" + response.status + "): " + String(detail).slice(0, 500));
  }

  const text = responseText(data);
  if (!text) throw new Error("OpenAI returned no output text.");
  return text;
}

function jsonSchemaFormat(name, schema) {
  return {
    type: "json_schema",
    name,
    strict: true,
    schema
  };
}

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: {
        confidence: { type: "integer", minimum: 0, maximum: 100 },
        clarity: { type: "integer", minimum: 0, maximum: 100 },
        fluency: { type: "integer", minimum: 0, maximum: 100 },
        eyeContact: { type: "integer", minimum: 0, maximum: 100 },
        expression: { type: "integer", minimum: 0, maximum: 100 },
        postureFraming: { type: "integer", minimum: 0, maximum: 100 },
        voiceDelivery: { type: "integer", minimum: 0, maximum: 100 }
      },
      required: ["confidence", "clarity", "fluency", "eyeContact", "expression", "postureFraming", "voiceDelivery"],
      additionalProperties: false
    },
    evidence: {
      type: "object",
      properties: {
        confidence: { type: "string" },
        clarity: { type: "string" },
        fluency: { type: "string" },
        eyeContact: { type: "string" },
        expression: { type: "string" },
        postureFraming: { type: "string" },
        voiceDelivery: { type: "string" }
      },
      required: ["confidence", "clarity", "fluency", "eyeContact", "expression", "postureFraming", "voiceDelivery"],
      additionalProperties: false
    },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    nextDrill: { type: "string" },
    contentFeedback: { type: "string" },
    visualFeedback: { type: "string" },
    voiceFeedback: { type: "string" },
    challengePassed: { type: "boolean" },
    challengeFeedback: { type: "string" }
  },
  required: [
    "scores", "evidence", "summary", "strengths", "improvements", "nextDrill",
    "contentFeedback", "visualFeedback", "voiceFeedback", "challengePassed", "challengeFeedback"
  ],
  additionalProperties: false
};

const FEAR_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    challenges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          prompt: { type: "string" },
          duration: { type: "integer", minimum: 30, maximum: 180 },
          category: {
            type: "string",
            enum: ["Content creation", "Interview", "Storytelling", "Opinion", "Business", "Fun", "History", "Networking"]
          },
          successRule: { type: "string" },
          why: { type: "string" }
        },
        required: ["id", "title", "description", "prompt", "duration", "category", "successRule", "why"],
        additionalProperties: false
      }
    }
  },
  required: ["title", "intro", "challenges"],
  additionalProperties: false
};

function weightedOverall(scores) {
  return Math.round(
    scores.confidence * 0.20 +
    scores.clarity * 0.15 +
    scores.fluency * 0.15 +
    scores.eyeContact * 0.15 +
    scores.expression * 0.10 +
    scores.postureFraming * 0.10 +
    scores.voiceDelivery * 0.15
  );
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "Spokify",
    aiEnabled: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || "gpt-6-astra") : null
  });
});

app.post("/api/outline", async (req, res) => {
  const prompt = cleanString(req.body && req.body.prompt, 500);
  if (!prompt) return res.status(400).json({ error: "Prompt is required." });

  try {
    const text = await callOpenAI({
      content: [{
        type: "input_text",
        text:
          "You are Spokify, a speaking coach. Create exactly 3 short outline bullets for this speaking prompt. " +
          "Do not write a full script. Keep each bullet under 22 words. Plain text, one bullet per line.\n\nPrompt: " + prompt
      }],
      maxOutputTokens: 220
    });

    const outline = text
      .split("\n")
      .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 3);

    if (outline.length !== 3) throw new Error("Outline format was incomplete.");
    res.json({ outline, provider: "openai" });
  } catch (error) {
    const status = error.code === "AI_NOT_CONFIGURED" ? 503 : 502;
    res.status(status).json({ error: error.message });
  }
});

app.post("/api/script", async (req, res) => {
  const prompt = cleanString(req.body && req.body.prompt, 500);
  if (!prompt) return res.status(400).json({ error: "Prompt is required." });

  try {
    const script = await callOpenAI({
      content: [{
        type: "input_text",
        text:
          "You are Spokify, a speaking coach. Write a natural 90-130 word sample spoken answer. " +
          "Use conversational English, a strong first sentence, two clear points, and a clean closing. " +
          "No headings or markdown. It is a learning example, not a script the user must memorize.\n\nPrompt: " + prompt
      }],
      maxOutputTokens: 400
    });
    res.json({ script: cleanString(script, 1800), provider: "openai" });
  } catch (error) {
    const status = error.code === "AI_NOT_CONFIGURED" ? 503 : 502;
    res.status(status).json({ error: error.message });
  }
});

app.post("/api/fear-challenges", async (req, res) => {
  const fear = cleanString(req.body && req.body.fear, 700);
  if (!fear) return res.status(400).json({ error: "Tell Spokify what speaking or camera situation you want to get better at." });

  try {
    const text = await callOpenAI({
      content: [{
        type: "input_text",
        text:
          "You are Spokify, a practical speaking-confidence coach. The user describes a fear or difficulty related to speaking, camera confidence, " +
          "presentations, interviews, social communication, networking, or content creation. Build EXACTLY 6 progressive, low-risk practice challenges. " +
          "Challenge 1 must feel very easy and private; each next challenge should increase difficulty gradually. " +
          "Every challenge must be completable inside Spokify with a camera/microphone speaking rep. " +
          "Use measurable success rules based only on observable performance such as duration, completing a structure, speaking pace, fillers, lens orientation, framing, or delivering the requested content. " +
          "Do not diagnose the user, do not infer mental health conditions, and do not create humiliation, harassment, dangerous exposure, or real-world confrontation tasks. " +
          "IDs must be c1, c2, c3, c4, c5, c6.\n\nUser's fear/difficulty:\n" + fear
      }],
      maxOutputTokens: 1800,
      format: jsonSchemaFormat("spokify_fear_challenges", FEAR_SCHEMA)
    });

    const plan = JSON.parse(text);
    if (!Array.isArray(plan.challenges) || plan.challenges.length !== 6) {
      throw new Error("AI did not return six challenges.");
    }
    res.json({ provider: "openai", plan });
  } catch (error) {
    console.error(error.message);
    const status = error.code === "AI_NOT_CONFIGURED" ? 503 : 502;
    res.status(status).json({ error: error.message });
  }
});

app.post("/api/analyze", async (req, res) => {
  const body = req.body || {};
  const payload = {
    prompt: cleanString(body.prompt, 700),
    category: cleanString(body.category, 80),
    mode: cleanString(body.mode, 80),
    transcript: cleanString(body.transcript, 9000),
    rawMetrics: body.rawMetrics && typeof body.rawMetrics === "object" ? body.rawMetrics : {},
    frames: Array.isArray(body.frames) ? body.frames.slice(0, 6) : [],
    challenge: body.challenge && typeof body.challenge === "object"
      ? {
          title: cleanString(body.challenge.title, 200),
          successRule: cleanString(body.challenge.successRule, 500)
        }
      : null
  };

  if (!payload.prompt) return res.status(400).json({ error: "Prompt is required." });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "AI scoring is unavailable because OPENAI_API_KEY is not configured. Spokify will not invent a fallback score."
    });
  }

  const visualFrames = payload.frames.filter(
    (frame) => typeof frame === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(frame)
  );

  try {
    const instruction =
      "You are the scoring engine for Spokify. Score this speaking performance from evidence, not from vibes and never randomly. " +
      "Use the transcript and raw delivery metrics for speech-related scores, and the supplied camera snapshots for visual scores. " +
      "If evidence is weak or a snapshot cannot support a conclusion, score conservatively and say so in the evidence string. " +
      "CONFIDENCE means observable delivery confidence (steady completion, directness, vocal presence, composure in presentation), NOT the person's internal emotion or mental state. " +
      "EYE CONTACT means apparent camera/lens orientation across snapshots; do not claim true gaze tracking. " +
      "EXPRESSION means observable facial expressiveness/variation and visible emphasis, NOT emotion recognition. " +
      "POSTURE/FRAMING means face visibility, centering, usable framing, and observable posture. " +
      "VOICE DELIVERY uses pace, voice activity, volume consistency, pauses, fillers, and transcript evidence; do not claim acoustic properties you were not given. " +
      "CLARITY measures how understandable and structured the spoken content is. FLUENCY measures continuity, fillers, and disruptive pauses. " +
      "Give specific evidence for every score. Do not infer sensitive traits, identity, health, mood, intelligence, personality, or diagnosis from images. " +
      "Return concise practical feedback. " +
      (payload.challenge
        ? "A locked challenge is attached. Set challengePassed=true ONLY if the available evidence supports that the success rule was actually met. Otherwise false and explain exactly what to retry."
        : "No locked challenge is attached. Set challengePassed=false and challengeFeedback to 'No locked challenge attached.'");

    const content = [{
      type: "input_text",
      text:
        instruction +
        "\n\nSession:\n" +
        JSON.stringify({
          prompt: payload.prompt,
          category: payload.category,
          mode: payload.mode,
          transcript: payload.transcript,
          rawMetrics: payload.rawMetrics,
          challenge: payload.challenge,
          snapshotCount: visualFrames.length
        })
    }];

    visualFrames.forEach((frame) => {
      content.push({ type: "input_image", image_url: frame, detail: "low" });
    });

    const text = await callOpenAI({
      content,
      maxOutputTokens: 2200,
      format: jsonSchemaFormat("spokify_performance_analysis", ANALYSIS_SCHEMA)
    });

    const parsed = JSON.parse(text);
    const scores = parsed.scores;
    Object.keys(scores).forEach((key) => {
      scores[key] = clamp(Math.round(Number(scores[key]) || 0), 0, 100);
    });

    res.json({
      provider: "openai",
      model: process.env.OPENAI_MODEL || "gpt-6-astra",
      overall: weightedOverall(scores),
      scores,
      evidence: parsed.evidence,
      summary: cleanString(parsed.summary, 900),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 4) : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.slice(0, 5) : [],
      nextDrill: cleanString(parsed.nextDrill, 700),
      contentFeedback: cleanString(parsed.contentFeedback, 700),
      visualFeedback: cleanString(parsed.visualFeedback, 700),
      voiceFeedback: cleanString(parsed.voiceFeedback, 700),
      challengePassed: Boolean(parsed.challengePassed),
      challengeFeedback: cleanString(parsed.challengeFeedback, 700)
    });
  } catch (error) {
    console.error(error.message);
    res.status(502).json({
      error: "OpenAI analysis failed. No fallback score was generated.",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

// ----- 1-on-1 Live signaling -----
let playerQueue = [];
let seekerQueue = [];
const rooms = new Map();
const socketRoom = new Map();

function removeFromQueues(id) {
  playerQueue = playerQueue.filter((socketId) => socketId !== id);
  seekerQueue = seekerQueue.filter((socketId) => socketId !== id);
}

function leaveCurrentRoom(socket) {
  const roomId = socketRoom.get(socket.id);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (room) {
    const partnerId = room.player === socket.id ? room.seeker : room.player;
    const partner = io.sockets.sockets.get(partnerId);
    if (partner) {
      partner.emit("partner-left");
      partner.leave(roomId);
      socketRoom.delete(partnerId);
    }
  }
  socket.leave(roomId);
  socketRoom.delete(socket.id);
  rooms.delete(roomId);
}

function isRoomMember(socketId, roomId) {
  const room = rooms.get(roomId);
  return Boolean(room && (room.player === socketId || room.seeker === socketId));
}

function tryMatch() {
  while (playerQueue.length && seekerQueue.length) {
    const playerId = playerQueue.shift();
    const seekerId = seekerQueue.shift();
    const player = io.sockets.sockets.get(playerId);
    const seeker = io.sockets.sockets.get(seekerId);

    if (!player || !seeker) {
      if (player) playerQueue.unshift(playerId);
      if (seeker) seekerQueue.unshift(seekerId);
      continue;
    }

    const roomId = "room_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    rooms.set(roomId, { player: playerId, seeker: seekerId });
    socketRoom.set(playerId, roomId);
    socketRoom.set(seekerId, roomId);
    player.join(roomId);
    seeker.join(roomId);

    player.emit("matched", { role: "player", roomId, initiator: true });
    seeker.emit("matched", { role: "seeker", roomId, initiator: false });
  }
}

io.on("connection", (socket) => {
  socket.on("find-partner", ({ role } = {}) => {
    removeFromQueues(socket.id);
    leaveCurrentRoom(socket);
    if (role === "player") playerQueue.push(socket.id);
    else if (role === "seeker") seekerQueue.push(socket.id);
    else return socket.emit("live-error", { message: "Choose Player or Seeker." });

    socket.emit("waiting", { role });
    tryMatch();
  });

  socket.on("cancel-search", () => removeFromQueues(socket.id));

  socket.on("signal", ({ roomId, data } = {}) => {
    if (!roomId || !data || !isRoomMember(socket.id, roomId)) return;
    socket.to(roomId).emit("signal", { data });
  });

  socket.on("start-timer", ({ roomId, duration } = {}) => {
    if (!roomId || !isRoomMember(socket.id, roomId)) return;
    const seconds = clamp(Number(duration) || 90, 30, 300);
    io.to(roomId).emit("timer-started", { duration: seconds, startAt: Date.now() });
  });

  socket.on("submit-rating", ({ roomId, rating } = {}) => {
    if (!roomId || !isRoomMember(socket.id, roomId)) return;
    const safeRating = clamp(Math.round(Number(rating) || 0), 1, 5);
    socket.to(roomId).emit("rating-received", { rating: safeRating });
  });

  socket.on("leave-room", () => {
    removeFromQueues(socket.id);
    leaveCurrentRoom(socket);
  });

  socket.on("disconnect", () => {
    removeFromQueues(socket.id);
    leaveCurrentRoom(socket);
  });
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Spokify running on port " + PORT);
});
