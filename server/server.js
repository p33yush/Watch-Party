require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const Room = require('./models/Room');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB connection
const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });


// Utility function to generate room code
function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Sanitize user input to prevent XSS and abuse
function sanitizeInput(str, maxLength = 500) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim().slice(0, maxLength);
}

// API Routes
// Create new room
app.post('/api/rooms', async (req, res) => {
  try {
    let roomCode = generateRoomCode();

    while (await Room.findOne({
      code: roomCode
    })) {
      roomCode = generateRoomCode();
    }

    const newRoom = await Room.create({
      code: roomCode
    });

    console.log(`room created: ${roomCode}`);

    res.json({ roomCode, message: 'Room created successfully' });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ message: 'Failed to create room' });

  }
});

// Get room info
app.get('/api/rooms/:code', async (req, res) => {
  try {
    const roomCode = req.params.code.toUpperCase();
    const room = await Room.findOne({ code: roomCode });

    if (!room) {
      return res.status(404).json({ message: 'room not found' });
    }

    res.json({
      code: room.code,
      currentVideo: room.currentVideo,
      isPlaying: room.isPlaying,
      currentTime: room.currentTime,
      userCount: room.users.length
    });
  } catch (error) {
    console.error('error fetching room:', error);
    res.status(500).json({ message: 'server issue' });
  }
});

// Basic route to serve homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  // Join room
  socket.on('join-room', async (data) => {
    const { roomCode, username } = data;
    const room = await Room.findOne({ code: roomCode });


    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Add user to room using atomic push to prevent VersionError race conditions
    const updatedRoom = await Room.findOneAndUpdate(
      { code: roomCode },
      { $push: { users: { socketId: socket.id, username } } },
      { new: true }
    );

    if (!updatedRoom) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Join socket room
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.username = username;

    console.log(`${username} joined room ${roomCode}`);

    // Notify others in the room
    socket.to(roomCode).emit('user-joined', {
      username,
      userCount: updatedRoom.users.length
    });

    // Send current room state to the new user
    socket.emit('room-state', {
      userCount: updatedRoom.users.length,
      currentVideo: room.currentVideo,
      isPlaying: room.isPlaying,
      currentTime: room.currentTime
    });
  });

  // Leave room
  socket.on('leave-room', (data) => {
    handleUserLeave(socket);
  });

  // Load video
  socket.on('load-video', async (data) => {
    const { roomCode, videoId, url } = data;
    const room = await Room.findOne({ code: roomCode });

    if (!room) return;

    room.currentVideo = videoId;
    room.currentTime = 0;
    room.isPlaying = false;
    await room.save();

    // Broadcast to all users in the room
    io.to(roomCode).emit('video-loaded', {
      videoId,
      url,
      title: 'New Video'
    });

    console.log(`Video loaded in room ${roomCode}: ${videoId}`);
  });

  // Video actions (play, pause, seek)
  socket.on('video-action', async (data) => {
    const { roomCode, action, currentTime } = data;
    let update = { currentTime: currentTime || 0 };
    if (action === 'play') update.isPlaying = true;
    else if (action === 'pause') update.isPlaying = false;

    await Room.updateOne({ code: roomCode }, { $set: update });

    if (action === 'play') {
      socket.to(roomCode).emit('video-play', { currentTime });
    }
    else if (action === 'pause') {
      socket.to(roomCode).emit('video-pause', { currentTime });
    }
    else if (action === 'seek') {
      socket.to(roomCode).emit('video-seek', { currentTime });
    }
  });

  // Chat messages
  socket.on('send-message', async (data) => {
    const { roomCode, username, text } = data;
    const room = await Room.findOne({ code: roomCode });

    if (!room) return;

    const cleanUsername = sanitizeInput(username, 20);
    const cleanText = sanitizeInput(text, 500);

    if (!cleanText) return;

    const message = {
      username: cleanUsername,
      text: cleanText,
      timestamp: new Date()
    };

    // Broadcast message to all users in the room
    io.to(roomCode).emit('new-message', message);

    console.log(`Message in room ${roomCode} from ${cleanUsername}: ${cleanText}`);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    handleUserLeave(socket);
  });
});

// Helper function to handle user leaving
async function handleUserLeave(socket) {
  const roomCode = socket.roomCode;
  const username = socket.username;

  if (!roomCode) return;

  const updatedRoom = await Room.findOneAndUpdate(
    { code: roomCode },
    { $pull: { users: { socketId: socket.id } } },
    { new: true }
  );

  if (!updatedRoom) return;

  // Remove empty rooms
  if (updatedRoom.users.length === 0) {
    await Room.deleteOne({ code: roomCode });
    console.log(`Room ${roomCode} deleted (empty)`);
  }

  // Notify others in the room
  socket.to(roomCode).emit('user-left', {
    username,
    userCount: updatedRoom.users.length
  });


  console.log(`${username} left room ${roomCode}`);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});