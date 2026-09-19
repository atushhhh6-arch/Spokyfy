const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(__dirname, "public")));

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cleanString = (value, max = 6000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function fallbackCoach(payload) {
  const m = payload.metrics || {};
  const pace = Number(m.paceScore || 0);
  const fluency = Number(m.fluencyScore || 0);
  const confidence = Number(m.confidenceScore || 0);
  const camera = Number(m.cameraScore || 0);
  const clarity = Number(m.clarityScore || 0);
  const overall = Number(m.overall || 0);
  const wpm = Number(m.wpm || 0);
  const fillers = Number(m.fillerCount || 0);
  const words = Number(m.wordCount || 0);

  const strengths = [];
  if (pace >= 78) strengths.push("Your speaking pace was easy to follow.");
  if (fluency >= 78) strengths.push("You kept the delivery flowing with relatively few interruptions.");
  if (camera >= 78) strengths.push("You stayed visually present and centered for most of the session.");
  if (clarity >= 78) strengths.push("Your delivery metrics suggest clear, controlled speech.");
  if (!strengths.length) strengths.push("You completed a full practice rep, which is the fastest way to build camera confidence.");

  const improvements = [];
  if (wpm && wpm < 105) improvements.push("Increase pace slightly. Aim for roughly 115–155 words per minute for conversational delivery.");
  if (wpm > 170) improvements.push("Slow down and add deliberate pauses after key ideas.");
  if (fillers > Math.max(3, words * 0.05)) improvements.push("Replace filler words with a short silent pause. Silence sounds more confident than repeated fillers.");
  if (camera < 72) improvements.push("Keep your face near the center of the frame and look toward the camera lens at the end of important sentences.");
  if (confidence < 72) improvements.push("Use a stronger first sentence and finish each thought completely before moving to the next idea.");
  if (improvements.length < 2) improvements.push("Add a simple structure: hook, two supporting points, then one clear closing sentence.");

  let summary = "Solid practice rep.";
  if (overall >= 85) summary = "Strong performance. Your delivery looked controlled and confident across most measured areas.";
  else if (overall >= 70) summary = "Good performance with a few specific habits that can make you sound noticeably more confident.";
  else summary = "Useful practice session. Focus on one improvement at a time instead of trying to fix everything in the next rep.";

  return {
    provider: "spokyfy-local",
    summary,
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 4),
    nextDrill:
      pace < 70
        ? "Do a 60-second rep where you intentionally pause for one second after every complete idea."
        : camera < 70
          ? "Do a 60-second camera-lens drill: look at the lens for the final five words of every sentence."
          : "Repeat the same topic for 60 seconds using only three sections: hook, two points, close.",
    contentFeedback:
      words < 45
        ? "Your transcript was short. Build each point with one reason and one example."
        : "Your response had enough material to review. On the next rep, make the opening and closing more deliberate."
  };
}

function fallbackOutline(prompt) {
  const topic = cleanString(prompt, 400) || "your topic";
  return [
    "HOOK — Say one surprising, personal, or opinionated sentence about: " + topic,
    "BODY — Give two clear points. For each point, add one reason or real example.",
    "CLOSE — End with one sentence that summarizes what you want the listener to remember."
  ];
}

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

async function callOpenAI(content, maxOutputTokens = 1200) {
  if (!process.env.OPENAI_API_KEY) return null;
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.OPENAI_API_KEY
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      max_output_tokens: maxOutputTokens,
      input: [{ role: "user", content }]
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error("AI request failed: " + response.status + " " + message.slice(0, 300));
  }
  return responseText(await response.json());
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "Spokyfy",
    aiEnabled: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || "gpt-5.6-luna") : null
  });
});

app.post("/api/outline", async (req, res) => {
  const prompt = cleanString(req.body && req.body.prompt, 500);
  if (!prompt) return res.status(400).json({ error: "Prompt is required." });

  const fallback = fallbackOutline(prompt);
  if (!process.env.OPENAI_API_KEY) return res.json({ outline: fallback, provider: "spokyfy-local" });

  try {
    const text = await callOpenAI([
      {
        type: "input_text",
        text:
          "You are a speaking coach. Create exactly 3 short speaking-outline bullets for this prompt. " +
          "Do not write a full script. Each bullet must be under 22 words. Return plain text with one bullet per line.\n\nPrompt: " +
          prompt
      }
    ], 220);

    const outline = (text || "")
      .split("\n")
      .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 3);

    res.json({ outline: outline.length === 3 ? outline : fallback, provider: "openai" });
  } catch (error) {
    console.error(error.message);
    res.json({ outline: fallback, provider: "spokyfy-local", warning: "AI unavailable; local outline used." });
  }
});


app.post("/api/script", async (req, res) => {
  const prompt = cleanString(req.body && req.body.prompt, 500);
  if (!prompt) return res.status(400).json({ error: "Prompt is required." });

  const fallback =
    "Start with your direct answer to the topic. Then explain your first reason with one real example. " +
    "Add a second point that gives a different angle. Finish by repeating the main idea in one memorable sentence.";

  if (!process.env.OPENAI_API_KEY) {
    return res.json({ script: fallback, provider: "spokyfy-local" });
  }

  try {
    const text = await callOpenAI([
      {
        type: "input_text",
        text:
          "You are a speaking coach. Write a natural 90-130 word sample spoken answer to this prompt. " +
          "Use simple conversational English, a strong first sentence, two clear points, and a clean closing. " +
          "Do not use headings, bullets, markdown, or overly formal language. The user should learn from it, not read it word-for-word.\n\nPrompt: " +
          prompt
      }
    ], 350);

    res.json({ script: cleanString(text, 1800) || fallback, provider: "openai" });
  } catch (error) {
    console.error(error.message);
    res.json({ script: fallback, provider: "spokyfy-local", warning: "AI unavailable; local sample used." });
  }
});

app.post("/api/analyze", async (req, res) => {
  const body = req.body || {};
  const payload = {
    prompt: cleanString(body.prompt, 500),
    category: cleanString(body.category, 80),
    mode: cleanString(body.mode, 80),
    transcript: cleanString(body.transcript, 7000),
    metrics: body.metrics && typeof body.metrics === "object" ? body.metrics : {},
    frames: Array.isArray(body.frames) ? body.frames.slice(0, 3) : []
  };

  const fallback = fallbackCoach(payload);
  if (!process.env.OPENAI_API_KEY) return res.json(fallback);

  try {
    const visualFrames = payload.frames.filter(
      (frame) => typeof frame === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(frame)
    );

    const instruction =
      "You are Spokyfy, a supportive but specific camera-speaking coach. Review the practice session using the prompt, transcript, measured metrics, and optional camera snapshots. " +
      "Do not infer sensitive traits, emotions, health, intelligence, or identity from images. Visual feedback must be limited to observable presentation behavior such as framing, face visibility, posture, and camera orientation. " +
      "Return ONLY valid JSON with this exact shape: " +
      '{"summary":"string","strengths":["string"],"improvements":["string"],"nextDrill":"string","contentFeedback":"string"}' +
      ". strengths must have 2-3 items; improvements must have 2-4 items. Be concise, actionable, and encouraging.";

    const content = [
      {
        type: "input_text",
        text:
          instruction +
          "\n\nSession data:\n" +
          JSON.stringify({
            prompt: payload.prompt,
            category: payload.category,
            mode: payload.mode,
            transcript: payload.transcript,
            metrics: payload.metrics
          })
      }
    ];

    visualFrames.forEach((frame) => content.push({ type: "input_image", image_url: frame }));

    const text = await callOpenAI(content, 1200);
    let parsed;
    try {
      parsed = JSON.parse((text || "").trim());
    } catch {
      parsed = null;
    }

    if (!parsed || typeof parsed !== "object") {
      return res.json({ ...fallback, provider: "spokyfy-local", warning: "AI returned an unexpected format." });
    }

    res.json({
      provider: "openai",
      summary: cleanString(parsed.summary, 700) || fallback.summary,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map((v) => cleanString(v, 260)).filter(Boolean).slice(0, 3) : fallback.strengths,
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.map((v) => cleanString(v, 300)).filter(Boolean).slice(0, 4) : fallback.improvements,
      nextDrill: cleanString(parsed.nextDrill, 500) || fallback.nextDrill,
      contentFeedback: cleanString(parsed.contentFeedback, 500) || fallback.contentFeedback
    });
  } catch (error) {
    console.error(error.message);
    res.json({ ...fallback, provider: "spokyfy-local", warning: "Deep AI was unavailable, so local coaching was used." });
  }
});

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
  console.log("Spokyfy running on port " + PORT);
});
