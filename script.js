const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const modal = document.getElementById('username-modal');
const usernameInput = document.getElementById('username-input');
const usernameSubmit = document.getElementById('username-submit');
const publicChatBtn = document.getElementById('public-chat');
const groupCodeInput = document.getElementById('group-code');
const joinGroupBtn = document.getElementById('join-group');
const currentGroupDisplay = document.getElementById('current-group');
const createGroupInput = document.getElementById('create-group-code');
const createGroupBtn = document.getElementById('create-group');
const imageInput = document.getElementById('image-input');
const fileInput = document.getElementById('file-input');
const attachImage = document.getElementById('attach-image');
const attachFile = document.getElementById('attach-file');
const voiceRecord = document.getElementById('voice-record');
const voiceRecorder = document.getElementById('voice-recorder');
const recordingTime = document.getElementById('recording-time');
const profilePicInput = document.getElementById('profile-pic-input');
const changeProfilePic = document.getElementById('change-profile-pic');
const profilePreview = document.getElementById('profile-preview');
const currentUserPic = document.getElementById('current-user-pic');

let username = '';
let currentGroup = 'public';
let isRecording = false;
let mediaRecorder;
let audioChunks = [];
let recordingStartTime;
let recordingTimer;
let userProfilePic = null;

// Hide the chat form initially
form.style.display = 'none';


// Function to handle username submission
function submitUsername() {
    username = usernameInput.value.trim();
    if (username) {
        socket.emit('set username', {
            username: username,
            profilePic: userProfilePic || profilePreview.src
        });
    }
}

// Handle username submission button click
usernameSubmit.addEventListener('click', () => {
    username = usernameInput.value.trim();
    if (username) {
        socket.emit('set username', {
            username: username,
            profilePic: userProfilePic || profilePreview.src
        });
        modal.style.display = 'none'; // Hide the modal after joining
        form.style.display = 'flex'; // Show the chat form
        currentGroupDisplay.textContent = 'Public Chat';
    }
});

// Handle Enter key in username input
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        submitUsername();
    }
});

// Show chat form once username is set
socket.on('username set', () => {
    console.log('Username set successfully'); // Debug log
    modal.style.display = 'none';
    form.style.display = 'flex';
});

// Handle chat form submission
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        socket.emit('chat message', {
            type: 'text',
            message: input.value
        });
        input.value = '';
    }
});

// Handle receiving messages
socket.on('chat message', (data) => {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.classList.add(data.username === username ? 'my-message' : 'other-message');

    // Add profile picture
    const profilePic = document.createElement('img');
    profilePic.classList.add('message-profile-pic');
    profilePic.src = data.profilePic || `https://ui-avatars.com/api/?name=${data.username}&background=random`;
    messageDiv.appendChild(profilePic);

    const usernameSpan = document.createElement('span');
    usernameSpan.classList.add('username');
    usernameSpan.textContent = data.username;
    messageDiv.appendChild(usernameSpan);

    switch(data.type) {
        case 'text':
            const textContent = document.createElement('div');
            textContent.textContent = data.message;
            messageDiv.appendChild(textContent);
            break;

        case 'image':
            const img = document.createElement('img');
            img.src = data.data;
            messageDiv.classList.add('image-message');
            messageDiv.appendChild(img);
            break;

        case 'file':
            const fileLink = document.createElement('a');
            fileLink.href = data.data;
            fileLink.download = data.name;
            fileLink.innerHTML = `<i class="fas fa-file"></i> ${data.name}`;
            messageDiv.classList.add('file-message');
            messageDiv.appendChild(fileLink);
            break;

        case 'voice':
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.src = data.data;
            messageDiv.classList.add('voice-message');
            messageDiv.appendChild(audio);
            break;
    }

    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
});

// Handle user joined notifications
socket.on('user joined', (username) => {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('system-message');
    messageDiv.textContent = `${username} joined the chat`;
    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
});

// Handle user left notifications
socket.on('user left', (username) => {
    if (username) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('system-message');
        messageDiv.textContent = `${username} left the chat`;
        messages.appendChild(messageDiv);
        messages.scrollTop = messages.scrollHeight;
    }
});

// Add error handling to hide loading on error
socket.on('group error', (message) => {
    hideLoading();
    alert(message);
});

createGroupBtn.addEventListener('click', () => {
    const groupCode = createGroupInput.value.trim();
    if (groupCode) {
        socket.emit('create group', groupCode);
        createGroupInput.value = '';
    }
});

socket.on('group created', (data) => {
    currentGroup = data.groupCode;
    currentGroupDisplay.textContent = `Private Group: ${data.groupCode}`;
    messages.innerHTML = '';
    alert(data.message);
});

// Image handling
attachImage.addEventListener('click', () => {
    imageInput.click();
});

imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('Image too large (max 5MB)');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            socket.emit('chat message', {
                type: 'image',
                data: e.target.result
            });
        };
        reader.readAsDataURL(file);
    }
});

// File handling
attachFile.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            socket.emit('chat message', {
                type: 'file',
                name: file.name,
                data: e.target.result
            });
        };
        reader.readAsDataURL(file);
    }
});

// Voice recording
voiceRecord.addEventListener('click', () => {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
});

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        isRecording = true;

        // Change microphone icon to indicate recording
        voiceRecord.innerHTML = '<i class="fas fa-stop-circle" style="color: #f44336;"></i>';
        voiceRecorder.style.display = 'flex';

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            isRecording = false;
            voiceRecord.innerHTML = '<i class="fas fa-microphone"></i>';
            voiceRecorder.style.display = 'none';

            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            socket.emit('chat message', {
                type: 'voice',
                data: audioUrl
            });

            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        recordingStartTime = Date.now();
        updateRecordingTime();
    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Could not access microphone');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        clearInterval(recordingTimer);
        voiceRecorder.style.display = 'none';
        isRecording = false;
    }
}

// Add a cancel recording option with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isRecording) {
        stopRecording();
        audioChunks = []; // Clear the recording
        voiceRecord.innerHTML = '<i class="fas fa-microphone"></i>';
        voiceRecorder.style.display = 'none';
    }
});

function updateRecordingTime() {
    recordingTimer = setInterval(() => {
        const duration = Date.now() - recordingStartTime;
        const seconds = Math.floor(duration / 1000);
        const minutes = Math.floor(seconds / 60);
        recordingTime.textContent = 
            `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    }, 1000);
}

// Add profile picture handling
changeProfilePic.addEventListener('click', () => {
    profilePicInput.click();
});

profilePicInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            userProfilePic = e.target.result;
            profilePreview.src = userProfilePic;
            currentUserPic.src = userProfilePic;
        };
        reader.readAsDataURL(file);
    }
});

// Fix the public chat button handler
publicChatBtn.addEventListener('click', () => {
    console.log('Public chat button clicked'); // Debug log
    socket.emit('join group', 'public');
    currentGroup = 'public';
    currentGroupDisplay.textContent = 'Public Chat';
    messages.innerHTML = ''; // Clear messages when switching
    
    // Update button states
    publicChatBtn.classList.add('active');
});

// Update the join group handler
joinGroupBtn.addEventListener('click', () => {
    const groupCode = groupCodeInput.value.trim();
    if (groupCode) {
        console.log('Joining group:', groupCode); // Debug log
        socket.emit('join group', groupCode);
        currentGroup = groupCode;
        currentGroupDisplay.textContent = `Group: ${groupCode}`;
        messages.innerHTML = ''; // Clear messages when switching
        groupCodeInput.value = ''; // Clear input after joining
        
        // Update button states
        publicChatBtn.classList.remove('active');
    }
});

// Add these socket listeners if not already present
socket.on('username set', () => {
    console.log('Username set successfully'); // Debug log
    modal.style.display = 'none';
    form.style.display = 'flex';
});

socket.on('group joined', (groupName) => {
    console.log('Joined group:', groupName); // Debug log
    currentGroup = groupName;
    currentGroupDisplay.textContent = groupName === 'public' 
        ? 'Public Chat' 
        : `Group: ${groupName}`;
    
    // Update button states
    publicChatBtn.classList.toggle('active', groupName === 'public');
});

// Add connection error handling
socket.on('connect_error', () => {
    console.log('Connection error');
    alert('Connection lost. Trying to reconnect...');
});

socket.on('error', (message) => {
    alert(message);
});

// Add theme switching functionality
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const themeInputs = document.querySelectorAll('input[name="theme"]');

// Toggle settings modal
settingsBtn.addEventListener('click', () => {
    settingsModal.classList.toggle('hidden');
});

// Close settings when clicking outside
document.addEventListener('click', (e) => {
    if (!settingsModal.contains(e.target) && !settingsBtn.contains(e.target)) {
        settingsModal.classList.add('hidden');
    }
});

// Theme switching
themeInputs.forEach(input => {
    input.addEventListener('change', (e) => {
        const theme = e.target.value;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('preferred-theme', theme);
    });
});

// Load saved theme
const savedTheme = localStorage.getItem('preferred-theme') || 'sunset';
document.documentElement.setAttribute('data-theme', savedTheme);
document.querySelector(`input[value="${savedTheme}"]`).checked = true;

