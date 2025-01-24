const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Expanded harmful content categories
const harmfulContent = {
    // Offensive Language
    offensive: [
        'fuck', 'shit', 'bitch', 'ass',
        // Add more as needed
    ],

    // Security Threats
    security: [
        'hack', 'ddos', 'exploit', 'virus',
        'malware', 'trojan', 'botnet',
        'password', 'credentials'
    ],

    // Spam Patterns
    spam: [
        'free money', 'you won', 'lottery',
        'bitcoin', 'crypto', 'investment',
        'make money fast', 'get rich'
    ],

    // Phishing Attempts
    phishing: [
        'verify account', 'login details',
        'bank account', 'credit card',
        'social security', 'password reset'
    ],

    // Harmful Patterns (Regular Expressions)
    patterns: [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,  // Script tags
        /javascript:/gi,  // JavaScript protocol
        /data:/gi,       // Data URLs
        /onerror=/gi,    // Event handlers
        /onclick=/gi,
        /eval\(/gi,      // JavaScript eval
        /(http|ftp|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:\/~+#-]*[\w@?^=%&\/~+#-])/gi  // URLs
    ],

    // IP Address Patterns
    ipAddresses: [
        /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g  // IPv4 addresses
    ]
};

// Update the filter function
function sanitizeAndFilterMessage(message, socket) {
    if (typeof message !== 'string') return '';

    const lowerMessage = message.toLowerCase();

    // Check offensive content
    if (harmfulContent.offensive.some(word => lowerMessage.includes(word))) {
        socket.emit('error', 'Message contains offensive language and was blocked');
        return null;
    }

    // Check security threats
    if (harmfulContent.security.some(word => lowerMessage.includes(word))) {
        socket.emit('error', 'Message contains security-related content and was blocked');
        return null;
    }

    // Check spam content
    if (harmfulContent.spam.some(phrase => lowerMessage.includes(phrase))) {
        socket.emit('error', 'Message appears to be spam and was blocked');
        return null;
    }

    // Check phishing attempts
    if (harmfulContent.phishing.some(phrase => lowerMessage.includes(phrase))) {
        socket.emit('error', 'Message appears to be a phishing attempt and was blocked');
        return null;
    }

    // Check harmful patterns
    if (harmfulContent.patterns.some(pattern => pattern.test(message))) {
        socket.emit('error', 'Message contains potentially harmful content and was blocked');
        return null;
    }

    // Check for IP addresses
    if (harmfulContent.ipAddresses.some(pattern => pattern.test(message))) {
        socket.emit('error', 'Sharing IP addresses is not allowed');
        return null;
    }

    // Basic XSS prevention
    return message
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .trim();
}

// Add spam detection
const messageHistory = new Map(); // Store recent messages per user
const SPAM_THRESHOLD = 3; // Number of similar messages allowed
const SPAM_TIME_WINDOW = 5000; // Time window in milliseconds (5 seconds)

function isSpam(userId, message) {
    if (!messageHistory.has(userId)) {
        messageHistory.set(userId, []);
    }

    const userHistory = messageHistory.get(userId);
    const now = Date.now();

    // Clean old messages
    while (userHistory.length > 0 && userHistory[0].time < now - SPAM_TIME_WINDOW) {
        userHistory.shift();
    }

    // Check for similar messages
    const similarMessages = userHistory.filter(m => m.text === message).length;

    // Add current message to history
    userHistory.push({ text: message, time: now });

    return similarMessages >= SPAM_THRESHOLD;
}

app.use(express.static('public'));

const users = new Map(); // Store username, profile pic, and socket id pairs
const groups = new Map(); // Store group information

// Add rate limiting
const messageRateLimit = new Map();

io.on('connection', (socket) => {
    socket.on('set username', (data) => {
        users.set(socket.id, {
            username: data.username,
            profilePic: data.profilePic,
            group: 'public'
        });
        socket.join('public');
        socket.emit('username set');
        io.to('public').emit('user joined', data.username);
    });

    socket.on('create group', (groupCode) => {
        const user = users.get(socket.id);
        if (user && groupCode) {
            if (groups.has(groupCode)) {
                socket.emit('group error', 'This group code already exists');
                return;
            }

            groups.set(groupCode, {
                creator: user.username,
                members: [user.username]
            });

            socket.leave(user.group);
            io.to(user.group).emit('user left', user.username);

            user.group = groupCode;
            socket.join(groupCode);
            users.set(socket.id, user);

            socket.emit('group created', {
                groupCode,
                message: `Group ${groupCode} created successfully!`
            });
        }
    });

    socket.on('join group', (groupCode) => {
        const user = users.get(socket.id);
        if (user) {
            if (groupCode === 'public') {
                socket.leave(user.group);
                io.to(user.group).emit('user left', user.username);
                user.group = 'public';
                socket.join('public');
                users.set(socket.id, user);
                socket.emit('group joined', 'public');
                io.to('public').emit('user joined', user.username);
                return;
            }

            if (!groups.has(groupCode)) {
                socket.emit('group error', 'This group does not exist');
                return;
            }

            socket.leave(user.group);
            io.to(user.group).emit('user left', user.username);
            user.group = groupCode;
            socket.join(groupCode);
            
            const group = groups.get(groupCode);
            if (!group.members.includes(user.username)) {
                group.members.push(user.username);
            }
            
            users.set(socket.id, user);
            socket.emit('group joined', groupCode);
            io.to(groupCode).emit('user joined', user.username);
        }
    });

    socket.on('chat message', (msg) => {
        const user = users.get(socket.id);
        if (user) {
            // Rate limiting
            const now = Date.now();
            const lastMessage = messageRateLimit.get(socket.id) || 0;
            if (now - lastMessage < 500) {
                socket.emit('error', 'Please wait before sending another message');
                return;
            }

            // Handle text messages
            if (msg.type === 'text') {
                // Check for spam
                if (isSpam(socket.id, msg.message)) {
                    socket.emit('error', 'Please avoid sending repeated messages');
                    return;
                }

                // Sanitize and filter message
                const filteredMessage = sanitizeAndFilterMessage(msg.message, socket);
                if (filteredMessage === null) {
                    return; // Message was blocked
                }
                msg.message = filteredMessage;
            }

            messageRateLimit.set(socket.id, now);

            io.to(user.group).emit('chat message', {
                username: user.username,
                profilePic: user.profilePic,
                ...msg
            });
        }
    });

    socket.on('upload', (file) => {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            socket.emit('error', 'File too large');
            return;
        }
        // ... rest of upload handling
    });

    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            io.to(user.group).emit('user left', user.username);
            users.delete(socket.id);
        }
        messageHistory.delete(socket.id);
        messageRateLimit.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
