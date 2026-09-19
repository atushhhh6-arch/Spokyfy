# Spokify

Spokify is a camera-first speaking confidence trainer with real OpenAI API scoring, topic spinning, progressive AI challenge paths, XP/levels, and 1-on-1 WebRTC practice.

## What's included

- Choose a speaking category, then use **Spin Topic** to get a random prompt from that category
- Camera + microphone practice with 1, 2, or 3 minute sessions
- Browser recording, playback, download, live transcript, WPM, filler count, pauses, voice activity, and framing evidence
- **OpenAI API scoring only** — no local/random fallback score
- AI scores: delivery confidence, clarity, fluency, apparent camera eye contact, facial expressiveness, posture/framing, and voice delivery
- Each score includes a short evidence explanation
- Overall score is a fixed weighted calculation from the AI-generated sub-scores
- **Ask AI**: describe a speaking/camera fear and get a 6-step progressive challenge path
- Challenge paths are sequentially locked: Task 2 unlocks only after AI confirms Task 1 passed, and so on
- XP, 50 levels, streaks, history, score trend, personal best, and total speaking time
- Ready-made quick challenges
- 1-on-1 Player/Seeker WebRTC practice with rating relay

## OpenAI setup

Spokify requires an OpenAI API key for scoring and for AI-generated fear challenge paths.

Set:

    OPENAI_API_KEY=your_key

Optional:

    OPENAI_MODEL=gpt-5.6-luna

If OPENAI_MODEL is not set, the server uses gpt-5.6-luna.

The key stays on the server. Never put it inside public/app.js.

If the AI API is unavailable or the key is missing, Spokify displays **AI score unavailable** and does not invent a fallback score.

## How scoring works

The browser collects raw measurable evidence:

- transcript when browser SpeechRecognition is available
- session duration / completion
- words per minute
- filler count
- long pauses
- voice activity and RMS volume consistency
- optional FaceDetector visibility/centering metrics
- up to six low-resolution camera snapshots across the session

The server sends those inputs to the OpenAI Responses API using Structured Outputs. AI returns seven evidence-backed sub-scores. The server computes the final overall score with a fixed weighting:

- Delivery confidence: 20%
- Clarity: 15%
- Fluency: 15%
- Apparent camera eye contact: 15%
- Facial expressiveness: 10%
- Posture / framing: 10%
- Voice delivery: 15%

Visual analysis is limited to observable presentation behavior. Spokify does not use images to infer emotions, mental state, health, intelligence, identity, or personality.

## Ask AI challenge path

Open **Challenges → Ask AI**, describe the speaking or camera situation you want to improve, and Spokify generates exactly six gradual tasks.

Only the first task starts unlocked. When a task is completed, the same OpenAI analysis checks the task's measurable success rule. The next task unlocks only when the AI response marks the current task as passed.

## Run locally

Requires Node.js 18+.

    npm install
    npm start

Then open:

    http://localhost:3000

Camera and microphone access normally require HTTPS outside localhost.

## Deploy

Deploy as a persistent Node/WebSocket service, for example on Render, Railway, Fly.io, or a VPS.

Build:

    npm install

Start:

    npm start

Live 1-on-1 mode uses Socket.IO + WebRTC, so the host must support WebSockets.

## Privacy

- Full practice video stays in the browser unless the user manually downloads it.
- The Node server does not store recordings.
- AI scoring receives the transcript, raw metrics, challenge rule when relevant, and up to six low-resolution snapshots.
- 1-on-1 video/audio is peer-to-peer WebRTC; the server relays signaling only.


## Troubleshooting AI

If the UI says the backend returned an empty response or a webpage instead of JSON:

1. Confirm the deployment is running `node server.js` / `npm start`, not only serving the `public/` folder.
2. Set `OPENAI_API_KEY` in the server host environment.
3. Use a valid OpenAI model ID such as `gpt-5.6-luna`.
4. Open `/api/health` on the deployed domain. It should return JSON with `"ok": true` and `"aiEnabled": true`.

A static-only deployment cannot run the AI endpoints or Socket.IO live mode.
