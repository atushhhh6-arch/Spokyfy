/**
 * Spokyfy Live — signaling server for the 1-on-1 Live (Omegle-style) feature.
 *
 * This server does NOT relay audio/video itself — it only matches a Player
 * with a Seeker and relays the small WebRTC signaling messages (SDP offer/
 * answer, ICE candidates) needed for their browsers to connect directly to
 * each other (peer-to-peer). It also keeps the round timer in sync and
 * relays the rating from Seeker -> Player at the end of a round.
 *
 * Deploy this anywhere that can run a persistent Node.js process, e.g.
 * Render, Railway, Fly.io, or a small VPS. Free tiers work fine to start.
 *
 * After deploying, copy your server's public URL (e.g.
 * https://spokyfy-live.onrender.com) and paste it into the
 * SIGNALING_SERVER_URL constant inside spokyfy-3.html.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.get('/', (req, res) => {
  res.send('Spokyfy Live signaling server is running.');
});

// Two separate queues so a Player always gets paired with a Seeker.
let playerQueue = [];
let seekerQueue = [];

// roomId -> { player: socketId, seeker: socketId }
const rooms = new Map();
// socketId -> roomId
const socketRoom = new Map();

function removeFromQueues(id) {
  playerQueue = playerQueue.filter(s => s !== id);
  seekerQueue = seekerQueue.filter(s => s !== id);
}

function tryMatch() {
  while (playerQueue.length > 0 && seekerQueue.length > 0) {
    const playerId = playerQueue.shift();
    const seekerId = seekerQueue.shift();
    const playerSocket = io.sockets.sockets.get(playerId);
    const seekerSocket = io.sockets.sockets.get(seekerId);

    if (!playerSocket || !seekerSocket) {
      // One of them disconnected while waiting — put the still-valid one back.
      if (playerSocket) playerQueue.unshift(playerId);
      if (seekerSocket) seekerQueue.unshift(seekerId);
      continue;
    }

    const roomId = `room_${playerId}_${seekerId}_${Date.now()}`;
    socketRoom.set(playerId, roomId);
    socketRoom.set(seekerId, roomId);
    rooms.set(roomId, { player: playerId, seeker: seekerId });

    playerSocket.join(roomId);
    seekerSocket.join(roomId);

    // The Player always creates the WebRTC offer (arbitrary but consistent choice).
    playerSocket.emit('matched', { role: 'player', roomId, initiator: true });
    seekerSocket.emit('matched', { role: 'seeker', roomId, initiator: false });
  }
}

function leaveCurrentRoom(socket) {
  const roomId = socketRoom.get(socket.id);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (room) {
    const partnerId = room.player === socket.id ? room.seeker : room.player;
    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      partnerSocket.emit('partner-left');
      socketRoom.delete(partnerId);
    }
  }
  socketRoom.delete(socket.id);
  rooms.delete(roomId);
}

io.on('connection', (socket) => {
  socket.on('find-partner', ({ role }) => {
    removeFromQueues(socket.id);
    if (role === 'player') playerQueue.push(socket.id);
    else seekerQueue.push(socket.id);
    socket.emit('waiting');
    tryMatch();
  });

  socket.on('cancel-search', () => {
    removeFromQueues(socket.id);
  });

  // Relay WebRTC signaling data (offer/answer/ICE candidates) to the other
  // person in the room. The server never inspects or stores this data.
  socket.on('signal', ({ roomId, data }) => {
    if (!roomId) return;
    socket.to(roomId).emit('signal', { data });
  });

  // Player starts the round — broadcast a synced start time so both
  // clients' countdowns match exactly, regardless of network latency.
  socket.on('start-timer', ({ roomId, duration }) => {
    if (!roomId) return;
    const startAt = Date.now();
    io.to(roomId).emit('timer-started', { duration, startAt });
  });

  // Seeker's rating goes only to their matched Player.
  socket.on('submit-rating', ({ roomId, rating }) => {
    if (!roomId) return;
    socket.to(roomId).emit('rating-received', { rating });
  });

  socket.on('leave-room', () => leaveCurrentRoom(socket));

  socket.on('disconnect', () => {
    removeFromQueues(socket.id);
    leaveCurrentRoom(socket);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Spokyfy Live signaling server running on port ${PORT}`);
});
