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
        playerReady: {}, // Tracked if players are ready
        scores: [],
        settings: null,
        questions: null,
        seed: null,    // Added seed storage
      };
    }

    const room = rooms[roomId];

    if (!room.players.includes(socket.id)) {
      room.players.push(socket.id);
      room.playerReady[socket.id] = false; // Initialize as not ready
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

    // Start game only if both players ready, questions and seed are set
    if (room.players.length === 2 && room.settings && room.questions && room.seed) {
      const allReady = Object.values(room.playerReady).every(ready => ready === true);
      if (allReady) {
        io.to(roomId).emit('start_quiz', {
          subject: room.settings.subject,
          difficulty: room.settings.difficulty,
          questions: room.questions,
          seed: room.seed, // Send the seed
        });
      }
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

      checkAndStartQuiz(roomId);
    }
  });

  // 🔹 Întrebările și seed-ul trimise de host
  socket.on('set_questions', ({ roomId, questions, seed }) => {
    if (rooms[roomId]) {
      rooms[roomId].questions = questions;
      rooms[roomId].seed = seed; // Store the seed
      console.log(`📨 Întrebări setate pentru camera ${roomId} cu seed: ${seed}`);

      checkAndStartQuiz(roomId);
    }
  });

  // 🔹 Player ready event
  socket.on('ready_to_start', ({ roomId }) => {
    if (rooms[roomId]) {
      rooms[roomId].playerReady[socket.id] = true;
      console.log(`👍 Jucătorul ${socket.id} este gata în camera ${roomId}`);
      
      checkAndStartQuiz(roomId);
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

  // Helper function to check if all conditions are met to start the quiz
  function checkAndStartQuiz(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    // Start only when all conditions are met
    if (room.players.length === 2 && 
        room.settings && 
        room.questions && 
        room.seed) {
          
      // Make sure both players are ready
      const allReady = room.players.every(playerId => {
        // Host (player who sets questions) is automatically ready
        if (playerId === room.players[0]) return true;
        return room.playerReady[playerId] === true;
      });
      
      if (allReady) {
        console.log(`🎮 Începere quiz în camera ${roomId}`);
        io.to(roomId).emit('start_quiz', {
          subject: room.settings.subject,
          difficulty: room.settings.difficulty,
          questions: room.questions,
          seed: room.seed, // Send the seed to clients
        });
      }
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serverul rulează pe portul ${PORT}`);
});
