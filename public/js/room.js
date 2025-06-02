// Global variables
let socket;
let player;
let currentRoomCode = '';
let isHost = false;
let username = 'User' + Math.floor(Math.random() * 1000);

// DOM elements
const roomCodeDisplay = document.getElementById('room-code-display');
const userCountDisplay = document.getElementById('user-count');
const videoUrlInput = document.getElementById('video-url-input');
const loadVideoBtn = document.getElementById('load-video-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const videoInfo = document.getElementById('video-info');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const errorModal = document.getElementById('error-modal');
const errorMessageText = document.getElementById('error-message-text');
const errorCloseBtn = document.getElementById('error-close-btn');

// Utility functions
function showLoading(show = true) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

function showError(message) {
    errorMessageText.textContent = message;
    errorModal.classList.remove('hidden');
}

function hideError() {
    errorModal.classList.add('hidden');
}

function getRoomCodeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('code');
}

function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function addChatMessage(message, isSystem = false) {
    const messageDiv = document.createElement('div');
    
    if (isSystem) {
        messageDiv.className = 'system-message';
        messageDiv.textContent = message;
    } else {
        messageDiv.className = 'message';
        const now = new Date();
        const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        messageDiv.innerHTML = `
            <div class="message-user">${message.username}</div>
            <div class="message-text">${message.text}</div>
            <div class="message-time">${timeString}</div>
        `;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Initialize room
async function initializeRoom() {
    showLoading(true);
    
    currentRoomCode = getRoomCodeFromURL();
    if (!currentRoomCode) {
        showError('No room code found. Please return to homepage.');
        return;
    }
    
    try {
        // Verify room exists
        const response = await fetch(`/api/rooms/${currentRoomCode}`);
        if (!response.ok) {
            showError('Room not found. Please check the room code.');
            return;
        }
        
        const roomData = await response.json();
        roomCodeDisplay.textContent = currentRoomCode;
        
        // Initialize Socket.IO
        initializeSocket();
        
        showLoading(false);
        addChatMessage(`Welcome to room ${currentRoomCode}!`, true);
        
    } catch (error) {
        console.error('Error initializing room:', error);
        showError('Failed to join room. Please try again.');
    }
}

// Initialize Socket.IO
function initializeSocket() {
    socket = io();
    
    // Join room
    socket.emit('join-room', { roomCode: currentRoomCode, username });
    
    // Socket event listeners
    socket.on('user-joined', (data) => {
        addChatMessage(`${data.username} joined the room`, true);
        userCountDisplay.textContent = data.userCount;
    });
    
    socket.on('user-left', (data) => {
        addChatMessage(`${data.username} left the room`, true);
        userCountDisplay.textContent = data.userCount;
    });
    
    socket.on('new-message', (message) => {
        addChatMessage(message);
    });
    
    socket.on('video-loaded', (data) => {
        loadYouTubeVideo(data.videoId);
        addChatMessage(`Video changed: ${data.title || 'New video'}`, true);
    });
    
    socket.on('video-play', (data) => {
        if (player && player.playVideo) {
            player.seekTo(data.currentTime, true);
            player.playVideo();
        }
    });
    
    socket.on('video-pause', (data) => {
        if (player && player.pauseVideo) {
            player.seekTo(data.currentTime, true);
            player.pauseVideo();
        }
    });
    
    socket.on('video-seek', (data) => {
        if (player && player.seekTo) {
            player.seekTo(data.currentTime, true);
        }
    });
    
    socket.on('room-state', (data) => {
        userCountDisplay.textContent = data.userCount;
        if (data.currentVideo) {
            loadYouTubeVideo(data.currentVideo);
            if (player) {
                player.seekTo(data.currentTime || 0, true);
                if (data.isPlaying) {
                    player.playVideo();
                } else {
                    player.pauseVideo();
                }
            }
        }
    });
    
    socket.on('error', (error) => {
        showError(error.message);
    });
}

// YouTube player functions
function onYouTubeIframeAPIReady() {
    // This function is called when YouTube API is ready
    console.log('YouTube API ready');
}

function loadYouTubeVideo(videoId) {
    if (!videoId) return;
    
    if (player) {
        player.loadVideoById(videoId);
    } else {
        player = new YT.Player('youtube-player', {
            height: '100%',
            width: '100%',
            videoId: videoId,
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            },
            playerVars: {
                'controls': 1,
                'modestbranding': 1,
                'rel': 0
            }
        });
    }
    
    playPauseBtn.disabled = false;
    videoInfo.textContent = `Video loaded`;
}

function onPlayerReady(event) {
    console.log('Player ready');
}

function onPlayerStateChange(event) {
    const state = event.data;
    
    // Don't sync if this change was triggered by a socket event
    if (window.skipNextStateChange) {
        window.skipNextStateChange = false;
        return;
    }
    
    const currentTime = player.getCurrentTime();
    
    if (state === YT.PlayerState.PLAYING) {
        playPauseBtn.textContent = '⏸️ Pause';
        socket.emit('video-action', {
            roomCode: currentRoomCode,
            action: 'play',
            currentTime: currentTime
        });
    } else if (state === YT.PlayerState.PAUSED) {
        playPauseBtn.textContent = '▶️ Play';
        socket.emit('video-action', {
            roomCode: currentRoomCode,
            action: 'pause',
            currentTime: currentTime
        });
    }
}

// Event listeners
loadVideoBtn.addEventListener('click', () => {
    const url = videoUrlInput.value.trim();
    if (!url) {
        showError('Please enter a YouTube URL');
        return;
    }
    
    const videoId = extractYouTubeId(url);
    if (!videoId) {
        showError('Please enter a valid YouTube URL');
        return;
    }
    
    socket.emit('load-video', {
        roomCode: currentRoomCode,
        videoId: videoId,
        url: url
    });
    
    videoUrlInput.value = '';
});

playPauseBtn.addEventListener('click', () => {
    if (!player) return;
    
    const state = player.getPlayerState();
    const currentTime = player.getCurrentTime();
    
    if (state === YT.PlayerState.PLAYING) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }
});

sendMessageBtn.addEventListener('click', sendMessage);

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

videoUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loadVideoBtn.click();
    }
});

errorCloseBtn.addEventListener('click', hideError);

function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    socket.emit('send-message', {
        roomCode: currentRoomCode,
        username: username,
        text: message
    });
    
    chatInput.value = '';
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeRoom();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.emit('leave-room', { roomCode: currentRoomCode, username });
    }
});