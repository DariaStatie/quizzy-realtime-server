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
    const room = rooms[roomId];

    // Dacă nu există, inițializăm
    if (!room) {
      rooms[roomId] = {
        players: [],
        scores: [],
        settings: null,
        questions: null,
        gameStarted: false
      };
    }

    // Verificăm din nou după inițializare
    const updatedRoom = rooms[roomId];

    // ❗ Dacă sunt deja 2 jucători, respinge conexiunea
    if (updatedRoom.players.length >= 2) {
      console.log(`❌ Camera ${roomId} este plină. Socket ${socket.id} a fost refuzat.`);
      if (callback) callback({ error: 'room_full' });
      socket.emit('room_full');
      return;
    }

    // Adaugă socket la cameră
    socket.join(roomId);
    console.log(`📥 Socket ${socket.id} a intrat în camera ${roomId}`);

    // Adaugă în listă dacă nu există
    if (!updatedRoom.players.includes(socket.id)) {
      updatedRoom.players.push(socket.id);
    }

    const isHost = updatedRoom.players[0] === socket.id;
    if (callback) {
      callback({
        isCreator: isHost,
        subject: updatedRoom.settings?.subject || null,
        difficulty: updatedRoom.settings?.difficulty || null
      });
    }

    io.to(roomId).emit('player_joined', updatedRoom.players);
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
    const room = rooms[roomId];
    if (!room) return;
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
      console.log(`⏳ Așteptăm guest-ul sau setările în camera ${roomId}...`);
    }
  });

  socket.on('ready_to_start', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.questions || !room.settings || room.gameStarted) return;

    if (room.players.length === 2) {
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

const PORT = process.env.PORT;
server.listen(PORT, () => {
  console.log(`🚀 Serverul rulează pe portul ${PORT}`);
});
