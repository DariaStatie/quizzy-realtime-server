const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('✅ Server Quizzy este online!');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let rooms = {};

io.on('connection', (socket) => {
  console.log('🟢 Conectat:', socket.id);

  socket.on('join_room', (roomId, callback) => {
    socket.join(roomId);
    console.log(`📥 Socket ${socket.id} a intrat în camera ${roomId}`);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        scores: [],
        settings: null,
        questions: null,
      };
    }

    const room = rooms[roomId];

    if (!room.players.includes(socket.id)) {
      room.players.push(socket.id);
    }

    const isHost = room.players[0] === socket.id;
    if (callback) {
      callback({
        isCreator: isHost,
        subject: room.settings?.subject || null,
        difficulty: room.settings?.difficulty || null,
      });
    }

    io.to(roomId).emit('player_joined', room.players);

    if (room.players.length === 2 && room.settings && room.questions) {
      io.to(roomId).emit('start_quiz', {
        subject: room.settings.subject,
        difficulty: room.settings.difficulty,
        questions: room.questions,
      });
    }
  });

  // 🔹 Răspuns la întrebarea "sunt eu host?"
  socket.on('who_is_host', (roomId, callback) => {
    const room = rooms[roomId];
    if (room && room.players.length > 0) {
      const isHost = room.players[0] === socket.id;
      if (callback) callback(isHost);
    } else {
      if (callback) callback(false);
    }
  });

  socket.on('set_quiz_settings', ({ roomId, subject, difficulty }) => {
    if (rooms[roomId]) {
      rooms[roomId].settings = { subject, difficulty };
      console.log(`📚 Setări salvate în ${roomId}:`, subject, difficulty);

      if (rooms[roomId].players.length === 2 && rooms[roomId].questions) {
        io.to(roomId).emit('start_quiz', {
          subject,
          difficulty,
          questions: rooms[roomId].questions,
        });
      }
    }
  });

  // 🔹 Întrebările trimise de host
  socket.on('set_questions', ({ roomId, questions }) => {
    if (rooms[roomId]) {
      rooms[roomId].questions = questions;
      console.log(`📨 Întrebări setate pentru camera ${roomId}.`);

      if (rooms[roomId].players.length === 2 && rooms[roomId].settings) {
        io.to(roomId).emit('start_quiz', {
          subject: rooms[roomId].settings.subject,
          difficulty: rooms[roomId].settings.difficulty,
          questions: rooms[roomId].questions,
        });
      }
    }
  });

  socket.on('answer', ({ roomId, answer, questionIndex }) => {
    socket.to(roomId).emit('opponent_answered', { answer, questionIndex });
  });

  socket.on('submit_score', ({ roomId, score }) => {
    if (!rooms[roomId]) return;

    rooms[roomId].scores.push(score);
    if (rooms[roomId].scores.length === 2) {
      const [player1, player2] = rooms[roomId].scores;
      io.to(roomId).emit('receive_scores', { player1, player2 });
      delete rooms[roomId];
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Deconectat:', socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players.includes(socket.id)) {
        room.players = room.players.filter(id => id !== socket.id);
        io.to(roomId).emit('player_left');
        if (room.players.length === 0) delete rooms[roomId];
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serverul rulează pe portul ${PORT}`);
});
