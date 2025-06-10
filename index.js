// ✅ index.js complet actualizat pentru server socket
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
    origin: '*',
    methods: ['GET', 'POST']
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
        gameStarted: false
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
        difficulty: room.settings?.difficulty || null
      });
    }

    io.to(roomId).emit('player_joined', room.players);
  });

  socket.on('who_is_host', (roomId, callback) => {
    const room = rooms[roomId];
    const isHost = room && room.players[0] === socket.id;
    if (callback) callback(!!isHost);
  });

  socket.on('set_quiz_settings', ({ roomId, subject, difficulty }) => {
    if (rooms[roomId]) {
      rooms[roomId].settings = { subject, difficulty };
      console.log(`📚 Setări salvate în ${roomId}:`, subject, difficulty);
    }
  });

  socket.on('set_questions', ({ roomId, questions }) => {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];
    room.questions = JSON.parse(JSON.stringify(questions));

    if (room.players.length === 2 && room.settings && !room.gameStarted) {
      const { subject, difficulty } = room.settings;
      console.log(`🎮 Start quiz în camera ${roomId} cu ${questions.length} întrebări`);
      room.gameStarted = true;
      io.to(roomId).emit('start_quiz', {
        subject,
        difficulty,
        questions: room.questions,
        isMultiplayer: true
      });
    } else {
      console.log(`⏳ Încă așteptăm guest-ul sau setările în camera ${roomId}...`);
    }
  });

  socket.on('ready_to_start', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.questions || !room.settings || room.gameStarted) return;

    if (room.players.length === 2 && room.settings && room.questions) {
      const { subject, difficulty } = room.settings;
      console.log(`🎮 Ambii jucători sunt gata în ${roomId}. Începe jocul!`);
      room.gameStarted = true;
      io.to(roomId).emit('start_quiz', {
        subject,
        difficulty,
        questions: room.questions,
        isMultiplayer: true
      });
    }
  });

  socket.on('answer', ({ roomId, answer, questionIndex }) => {
    socket.to(roomId).emit('opponent_answered', { answer, questionIndex });
  });

  socket.on('submit_score', ({ roomId, score }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.scores.push({ socketId: socket.id, score });
    if (room.scores.length === 2) {
      const [p1, p2] = room.scores;
      io.to(roomId).emit('receive_scores', {
        player1: p1.score,
        player2: p2.score
      });
      delete rooms[roomId];
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Deconectat:', socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players.includes(socket.id)) {
        room.players = room.players.filter(id => id !== socket.id);
        room.scores = room.scores.filter(s => s.socketId !== socket.id);
        io.to(roomId).emit('player_left', room.players);
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
