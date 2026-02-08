const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Storage
const bannedUsernames = new Set();          // lowercase usernames
const bannedIPs = new Set();                // banned IP strings
const userLastIP = new Map();               // lowercase username → last IP
const userAvatars = {};

let onlineUsers = 0;
const recentMessages = [];
const MAX_HISTORY = 100;
const lastMessageTime = new Map();

const ADMIN_SECRET = 'Admin-19671290yds87qatd78012epasgf8d5!!!!';

function getClientIP(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address || 'unknown';
}

function sendBanListToAdmins() {
  const banList = Array.from(bannedUsernames).map(lowerName => ({
    username: lowerName,
    ip: userLastIP.get(lowerName) || null
  }));

  for (const client of io.sockets.sockets.values()) {
    if (client.username === ADMIN_SECRET) {
      client.emit('ban-list-update', { bannedUsernames: banList });
    }
  }
}

io.on('connection', (socket) => {
  const clientIP = getClientIP(socket);

  // Immediate IP ban check
  if (bannedIPs.has(clientIP)) {
    socket.emit('banned', { reason: 'Your IP is banned.' });
    socket.disconnect(true);
    return;
  }

  onlineUsers++;
  io.emit('online', onlineUsers);

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

    // Only broadcast join if NOT admin
    if (username !== ADMIN_SECRET) {
      io.emit('message', { system: true, text: `${username} joined the chat!` });
    }

    if (recentMessages.length > 0) {
      socket.emit('history', recentMessages);
    }

    // If this is admin, send ban list
    if (username === ADMIN_SECRET) {
      sendBanListToAdmins();
    }
  });

  socket.on('chat message', (msg, callback) => {
    if (!socket.username || !msg.trim()) {
      if (callback) callback(false);
      return;
    }

    const now = Date.now();
    const last = lastMessageTime.get(socket.id) || 0;
    if (now - last < 1500) {
      if (callback) callback(false);
      return;
    }

    lastMessageTime.set(socket.id, now);

    const messageData = {
      username: socket.username,
      avatarURL: socket.avatarURL,
      text: msg.trim(),
      isImage: false
    };

    io.emit('message', messageData);
    recentMessages.push(messageData);
    if (recentMessages.length > MAX_HISTORY) recentMessages.shift();

    if (callback) callback(true);
  });

  socket.on('image', (data, callback) => {
    if (!socket.username) {
      if (callback) callback(false);
      return;
    }

    const now = Date.now();
    const last = lastMessageTime.get(socket.id) || 0;
    if (now - last < 3000) {
      if (callback) callback(false);
      return;
    }

    lastMessageTime.set(socket.id, now);

    const messageData = {
      username: socket.username,
      avatarURL: socket.avatarURL,
      image: data.buffer,
      mime: data.mime,
      isImage: true
    };

    io.emit('message', messageData);
    recentMessages.push(messageData);
    if (recentMessages.length > MAX_HISTORY) recentMessages.shift();

    if (callback) callback(true);
  });

  socket.on('admin-clear-chat', () => {
    if (socket.username === ADMIN_SECRET) {
      recentMessages.length = 0;
      io.emit('clear-chat');
      io.emit('message', { system: true, text: 'Chat was cleared by admin.' });
    }
  });

  socket.on('admin-toggle-chaos', (enable) => {
    if (socket.username === ADMIN_SECRET) {
      io.emit('chaos-toggle', enable);
    }
  });

  socket.on('admin-toggle-tempo', (enable) => {
    if (socket.username === ADMIN_SECRET) {
      io.emit('tempo-toggle', enable);
    }
  });

  socket.on('admin-ban-user', (targetUsername) => {
    if (socket.username !== ADMIN_SECRET) return;

    const lowerName = targetUsername.trim().toLowerCase();
    if (!lowerName) return;

    bannedUsernames.add(lowerName);

    const lastIP = userLastIP.get(lowerName);
    if (lastIP) {
      bannedIPs.add(lastIP);
      console.log(`Banned IP ${lastIP} for username ${targetUsername}`);
    }

    io.emit('message', { system: true, text: `Admin banned username "${targetUsername}" (and associated IP).` });

    // Kick anyone currently using that name
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

    // Also unban the associated IP
    const lastIP = userLastIP.get(lowerName);
    if (lastIP) {
      bannedIPs.delete(lastIP);
      console.log(`Unbanned IP ${lastIP} for username ${targetUsername}`);
    }

    io.emit('message', { system: true, text: `Admin unbanned username "${targetUsername}" (and associated IP).` });

    sendBanListToAdmins();
  });

  socket.on('disconnect', () => {
    onlineUsers--;
    lastMessageTime.delete(socket.id);

    // Only broadcast leave if NOT admin
    if (socket.username && socket.username !== ADMIN_SECRET) {
      io.emit('message', { system: true, text: `${socket.username} left the chat.` });
    }

    io.emit('online', onlineUsers);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
