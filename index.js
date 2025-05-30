const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Înlocuiește cu domeniul aplicației tale mobile dacă vrei mai multă securitate
    methods: ["GET", "POST"]
  }
});

let rooms = {};

io.on('connection', (socket) => {
  console.log('🟢 Nou client conectat:', socket.id);

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push(socket.id);

    io.to(roomId).emit('player_joined', rooms[roomId]);

    // Dacă sunt 2 jucători, începe meciul
    if (rooms[roomId].length === 2) {
      io.to(roomId).emit('start_quiz');
    }
  });

  socket.on('answer', ({ roomId, answer, questionIndex }) => {
    socket.to(roomId).emit('opponent_answered', { answer, questionIndex });
  });

  socket.on('disconnect', () => {
    console.log('🔴 Client deconectat:', socket.id);
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      if (rooms[roomId].length === 0) delete rooms[roomId];
      else io.to(roomId).emit('player_left');
    }
  });
});

server.listen(3000, () => {
  console.log('🚀 Serverul rulează pe portul 3000');
});
