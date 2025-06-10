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
        difficulty: room.settings?.difficulty || null,
      });
    }

    io.to(roomId).emit('player_joined', room.players);
  });

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
    }
  });

  // ✅ MODIFICAT: Suport pentru guest întârziat
  socket.on('set_questions', ({ roomId, questions }) => {
    if (!rooms[roomId]) return;

    console.log(`📨 ${socket.id} setează ${questions.length} întrebări pentru camera ${roomId}`);

    const room = rooms[roomId];
    room.questions = JSON.parse(JSON.stringify(questions)); // deep copy

    if (
      room.players.length === 2 &&
      room.settings &&
      !room.gameStarted
    ) {
      const { subject, difficulty } = room.settings;
      console.log(`🎮 Start quiz în camera ${roomId} cu ${questions.length} întrebări`);
      if (questions.length > 0) {
        console.log(`🔍 Prima întrebare: "${questions[0].question}"`);
      }

      room.gameStarted = true;

      io.to(roomId).emit('start_quiz', {
        subject,
        difficulty,
        questions: room.questions,
        isMultiplayer: true,
      });
    } else {
      console.log(`⏳ Încă așteptăm guest-ul sau setările în camera ${roomId}...`);
    }
  });

  // ✅ LOG DETALIAT în ready_to_start
  socket.on('ready_to_start', ({ roomId }) => {
    console.log(`📥 ready_to_start primit de la ${socket.id} în camera ${roomId}`);

    const room = rooms[roomId];

    if (!room || !room.questions || !room.settings || room.gameStarted) {
      console.log(`❌ Nu putem porni quizul în ${roomId} (questions: ${!!room?.questions}, settings: ${!!room?.settings}, gameStarted: ${room?.gameStarted})`);
      return;
    }

    if (
      room.players.length === 2 &&
      room.settings &&
      room.questions
    ) {
      const { subject, difficulty } = room.settings;
      console.log(`🎮 Ambii jucători sunt gata în ${roomId}. Începe jocul!`);

      room.gameStarted = true;

      io.to(roomId).emit('start_quiz', {
        subject,
        difficulty,
        questions: room.questions,
        isMultiplayer: true,
      });
    } else {
      console.log(`⏳ Guest-ul e gata, dar lipsesc fie întrebările, fie host-ul...`);
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
