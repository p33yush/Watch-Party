const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB connection
const mongoURI = 'mongodb+srv://01pittypatty:passMONGO@cluster0.i2e1e7y.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(mongoURI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    console.log('Falling back to in-memory storage');
  });

// In-memory storage for rooms (temporary)
const rooms = new Map();

// Utility function to generate room code
function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// API Routes
// Create new room
app.post('/api/rooms', (req, res) => {
  const roomCode = generateRoomCode();
  
  // Make sure room code is unique
  while (rooms.has(roomCode)) {
    roomCode = generateRoomCode();
  }
  
  const newRoom = {
    code: roomCode,
    createdAt: new Date(),
    currentVideo: null,
    isPlaying: false,
    currentTime: 0,
    users: []
  };
  
  rooms.set(roomCode, newRoom);
  
  console.log(`Room created: ${roomCode}`);
  res.json({ roomCode, message: 'Room created successfully' });
});

// Get room info
app.get('/api/rooms/:code', (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const room = rooms.get(roomCode);
  
  if (!room) {
    return res.status(404).json({ message: 'Room not found' });
  }
  
  res.json({
    code: room.code,
    currentVideo: room.currentVideo,
    isPlaying: room.isPlaying,
    currentTime: room.currentTime,
    userCount: room.users.length
  });
});

// Basic route to serve homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  // Join room
  socket.on('join-room', (data) => {
    const { roomCode, username } = data;
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    // Add user to room
    const user = { id: socket.id, username, socketId: socket.id };
    room.users.push(user);
    
    // Join socket room
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.username = username;
    
    console.log(`${username} joined room ${roomCode}`);
    
    // Notify others in the room
    socket.to(roomCode).emit('user-joined', {
      username,
      userCount: room.users.length
    });
    
    // Send current room state to the new user
    socket.emit('room-state', {
      userCount: room.users.length,
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
  socket.on('load-video', (data) => {
    const { roomCode, videoId, url } = data;
    const room = rooms.get(roomCode);
    
    if (!room) return;
    
    room.currentVideo = videoId;
    room.currentTime = 0;
    room.isPlaying = false;
    
    // Broadcast to all users in the room
    io.to(roomCode).emit('video-loaded', {
      videoId,
      url,
      title: 'New Video'
    });
    
    console.log(`Video loaded in room ${roomCode}: ${videoId}`);
  });
  
  // Video actions (play, pause, seek)
  socket.on('video-action', (data) => {
    const { roomCode, action, currentTime } = data;
    const room = rooms.get(roomCode);
    
    if (!room) return;
    
    room.currentTime = currentTime || 0;
    
    if (action === 'play') {
      room.isPlaying = true;
      socket.to(roomCode).emit('video-play', { currentTime });
    } else if (action === 'pause') {
      room.isPlaying = false;
      socket.to(roomCode).emit('video-pause', { currentTime });
    } else if (action === 'seek') {
      socket.to(roomCode).emit('video-seek', { currentTime });
    }
  });
  
  // Chat messages
  socket.on('send-message', (data) => {
    const { roomCode, username, text } = data;
    const room = rooms.get(roomCode);
    
    if (!room) return;
    
    const message = {
      username,
      text,
      timestamp: new Date()
    };
    
    // Broadcast message to all users in the room
    io.to(roomCode).emit('new-message', message);
    
    console.log(`Message in room ${roomCode} from ${username}: ${text}`);
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    handleUserLeave(socket);
  });
});

// Helper function to handle user leaving
function handleUserLeave(socket) {
  const roomCode = socket.roomCode;
  const username = socket.username;
  
  if (!roomCode) return;
  
  const room = rooms.get(roomCode);
  if (!room) return;
  
  // Remove user from room
  room.users = room.users.filter(user => user.socketId !== socket.id);
  
  // Notify others in the room
  socket.to(roomCode).emit('user-left', {
    username,
    userCount: room.users.length
  });
  
  // Remove empty rooms
  if (room.users.length === 0) {
    rooms.delete(roomCode);
    console.log(`Room ${roomCode} deleted (empty)`);
  }
  
  console.log(`${username} left room ${roomCode}`);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});