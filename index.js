const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// ✅ Rută de test pentru Railway
app.get('/', (req, res) => {
  res.send('✅ Server Socket IO este online');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Poți seta aici domeniul aplicației mobile pentru securitate
    methods: ["GET", "POST"]
  }
});

let rooms = {};

io.on('connection', (socket) => {
  console.log('🟢 Nou client conectat:', socket.id);

  socket.on('join_room', (roomId) => {
    console.log(`📥 Socket ${socket.id} a intrat în camera ${roomId}`);
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        scores: [],
      };
    }

    if (!rooms[roomId].players.includes(socket.id)) {
      rooms[roomId].players.push(socket.id);
    }

    io.to(roomId).emit('player_joined', rooms[roomId].players);

    if (rooms[roomId].players.length === 2) {
      io.to(roomId).emit('start_quiz');
    }
  });

  socket.on('answer', ({ roomId, answer, questionIndex }) => {
    socket.to(roomId).emit('opponent_answered', { answer, questionIndex });
  });

  socket.on('submit_score', ({ roomId, score }) => {
    console.log(`📨 Scor primit din camera ${roomId}: ${score}`);
    if (!rooms[roomId]) return;

    rooms[roomId].scores.push(score);

    if (rooms[roomId].scores.length === 2) {
      const [player1, player2] = rooms[roomId].scores;
      io.to(roomId).emit('receive_scores', { player1, player2 });

      // Șterge camera după finalizare
      delete rooms[roomId];
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Client deconectat:', socket.id);

    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players.includes(socket.id)) {
        room.players = room.players.filter(id => id !== socket.id);
        io.to(roomId).emit('player_left');

        if (room.players.length === 0) {
          delete rooms[roomId];
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => {
  res.send("Server Quizzy funcționează!");
});
server.listen(PORT, () => {
  console.log(`🚀 Serverul rulează pe portul ${PORT}`);
});
