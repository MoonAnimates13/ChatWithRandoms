const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// Ban storage
const bannedUsernames = new Set();
const bannedIPs = new Set();
const userLastIP = new Map(); // lowercase username → IP

let onlineUsers = 0;
const recentMessages = [];
const MAX_HISTORY = 100;
const userAvatars = {};
const lastMessageTime = new Map();
const ADMIN_SECRET = 'Admin-87a6d987asdt8yaguksdghfas7d!';

function getClientIP(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return socket.handshake.address || 'unknown';
}

function sendBanListToAdmins() {
  const banList = Array.from(bannedUsernames).map((lowerName) => ({
    username: lowerName,
    ip: userLastIP.get(lowerName) || null
  }));

  // Send only to admins (clients with ADMIN_SECRET username)
  for (const client of io.sockets.sockets.values()) {
    if (client.username === ADMIN_SECRET) {
      client.emit('ban-list-update', { bannedUsernames: banList });
    }
  }
}

io.on('connection', (socket) => {
  const clientIP = getClientIP(socket);

  if (bannedIPs.has(clientIP)) {
    socket.emit('banned', { reason: 'Your IP is banned.' });
    socket.disconnect(true);
    return;
  }

  onlineUsers++;
  io.emit('online', onlineUsers);

  // Send ban list if this is admin
  if (socket.handshake.query?.username === ADMIN_SECRET) {
    sendBanListToAdmins();
  }

  socket.on('join', (data) => {
    const { name, avatarURL } = data;
    const username = (name || 'Anonymous').trim();
    const lowerUsername = username.toLowerCase();

    if (bannedUsernames.has(lowerUsername)) {
      socket.emit('banned', { reason: 'This username is banned.' });
      socket.disconnect(true);
      return;
    }

    socket.username = username;
    socket.avatarURL = avatarURL || '';
    userAvatars[username] = socket.avatarURL;

    userLastIP.set(lowerUsername, clientIP);

    io.emit('message', { system: true, text: `${socket.username} joined the chat!` });
    if (recentMessages.length > 0) socket.emit('history', recentMessages);

    // If admin just joined, send ban list
    if (username === ADMIN_SECRET) {
      sendBanListToAdmins();
    }
  });

  // ... your existing chat message, image, clear-chat, toggle-chaos, toggle-tempo handlers ...

  socket.on('admin-ban-user', (targetUsername) => {
    if (socket.username !== ADMIN_SECRET) return;
    const lowerName = targetUsername.trim().toLowerCase();
    if (!lowerName) return;

    bannedUsernames.add(lowerName);

    const lastIP = userLastIP.get(lowerName);
    if (lastIP) {
      bannedIPs.add(lastIP);
      console.log(`Banned IP ${lastIP} for ${targetUsername}`);
    }

    io.emit('message', { system: true, text: `Admin banned "${targetUsername}" (and associated IP).` });

    // Kick matching users
    for (const client of io.sockets.sockets.values()) {
      if (client.username?.toLowerCase() === lowerName) {
        client.emit('banned', { reason: 'You have been banned.' });
        client.disconnect(true);
      }
    }

    sendBanListToAdmins();
  });

  socket.on('admin-unban-user', (targetUsername) => {
    if (socket.username !== ADMIN_SECRET) return;
    const lowerName = targetUsername.trim().toLowerCase();
    if (!lowerName) return;

    bannedUsernames.delete(lowerName);

    // NEW: Also unban the associated IP
    const lastIP = userLastIP.get(lowerName);
    if (lastIP) {
      bannedIPs.delete(lastIP);
      console.log(`Unbanned IP ${lastIP} for ${targetUsername}`);
    }

    io.emit('message', { system: true, text: `Admin unbanned "${targetUsername}" (and associated IP).` });

    sendBanListToAdmins();
  });

  socket.on('disconnect', () => {
    onlineUsers--;
    lastMessageTime.delete(socket.id);
    if (socket.username) {
      io.emit('message', { system: true, text: `${socket.username} left the chat.` });
    }
    io.emit('online', onlineUsers);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));
