const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  currentVideo: {
    type: String,
    default: null
  },
  isPlaying: {
    type: Boolean,
    default: false
  },
  currentTime: {
    type: Number,
    default: 0
  },
  users: [
    {
      socketId: String,
      username: String
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600  // auto-delete after 1 hour (TTL index)
  }
});

module.exports = mongoose.model('Room', roomSchema);
