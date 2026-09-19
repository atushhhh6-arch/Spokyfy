# Spokyfy

Spokyfy is a camera-first speaking confidence trainer. It combines short recorded practice reps, browser speech metrics, optional AI coaching, XP and levels, challenges, and 1-on-1 WebRTC practice.

## Features

- Camera and microphone practice
- 1, 2, or 3 minute speaking reps
- Creator, Interview, Story, Opinion, Business, Fun, History, and Networking categories
- Off-the-cuff and Deep Dive modes
- Random topic spinner
- Three-point speaking outline assistance
- Browser video recording with local playback and download
- Live transcript when the browser supports SpeechRecognition
- WPM, filler-word, long-pause, voice-activity, completion, and camera-framing metrics
- Confidence, clarity, fluency, camera-focus, and overall scoring
- End-of-session coaching with strengths, improvements, next drill, and content feedback
- Optional OpenAI text and vision coaching using transcript, metrics, and up to three low-resolution snapshots
- XP, 50 levels, streaks, session history, score trend, personal best, and speaking time
- Public-style speaking challenge board and shareable results
- 1-on-1 Player/Seeker WebRTC matchmaking, synced round timer, and rating relay

## Run locally

Requires Node.js 18 or newer.

    npm install
    npm start

Then open http://localhost:3000

Camera and microphone access normally require HTTPS in production. Browsers allow them on localhost for development.

## Deep AI coaching

The app works without an AI key. In that case the analysis route uses deterministic local coaching based on the measured speaking metrics.

For deeper coaching, set these server environment variables:

    OPENAI_API_KEY=your_key
    OPENAI_MODEL=gpt-5.6-luna

OPENAI_MODEL is optional. The server defaults to gpt-5.6-luna.

The API key stays server-side and must never be added to public/app.js.

When deep AI is enabled, the analysis route can receive the transcript, measured speaking metrics, and up to three low-resolution camera snapshots. The coaching prompt restricts visual feedback to observable presentation behavior such as framing, posture, face visibility, and camera orientation.

## Deploy

This project runs as one Node service. Deploy it to a host that supports persistent Node processes and WebSockets, such as Render, Railway, Fly.io, or a VPS.

Build command:

    npm install

Start command:

    npm start

Set OPENAI_API_KEY only when you want deep AI coaching.

## Camera scoring

When the browser supports the FaceDetector API, Spokyfy uses face visibility and centered framing as a camera-focus proxy. It does not claim to measure emotions, personality, intelligence, or mental state. Browsers without FaceDetector receive a neutral camera score and can still use every other metric.

## Privacy

- The full practice recording stays in the browser unless the user manually downloads it.
- The Node server does not store practice recordings.
- Live mode video and audio use peer-to-peer WebRTC. The server only handles matchmaking and signaling.
- Deep AI analysis only uses data sent to the analysis endpoint.
