// DOM elements
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const errorMessage = document.getElementById('error-message');
const loading = document.getElementById('loading');

// Utilities
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    setTimeout(() => {
        errorMessage.classList.add('hidden');
    }, 5000);
}

function showLoading(show = true) {
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Create room functionality
createRoomBtn.addEventListener('click', async () => {
    showLoading(true);
    
    try {
        const response = await fetch('/api/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'create'
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            // Redirect to room page
            window.location.href = `/room.html?code=${data.roomCode}`;
        } else {
            const error = await response.json();
            showError(error.message || 'Failed to create room');
        }
    } catch (error) {
        showError('Network error. Please try again.');
        console.error('Error creating room:', error);
    } finally {
        showLoading(false);
    }
});

// Join room functionality
joinRoomBtn.addEventListener('click', async () => {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    
    if (!roomCode) {
        showError('Please enter a room code');
        return;
    }
    
    if (roomCode.length !== 6) {
        showError('Room code must be 6 characters');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`/api/rooms/${roomCode}`);
        
        if (response.ok) {
            const data = await response.json();
            // Redirect to room page
            window.location.href = `/room.html?code=${roomCode}`;
        } else if (response.status === 404) {
            showError('Room not found. Please check the code.');
        } else {
            showError('Error joining room. Please try again.');
        }
    } catch (error) {
        showError('Network error. Please try again.');
        console.error('Error joining room:', error);
    } finally {
        showLoading(false);
    }
});

// Enter key support for room code input
roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoomBtn.click();
    }
});

// Auto-format room code input (uppercase, limit to 6 chars)
roomCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
});