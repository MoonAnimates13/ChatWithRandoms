const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const bannedUsernames = new Set();
const bannedIPs = new Set();
const userLastIP = new Map();
const userAvatars = {};

let onlineUsers = 0;
const recentMessages = [];
const MAX_HISTORY = 100;
const lastMessageTime = new Map();

const ADMIN_SECRET = 'Admin-19671290yds87qatd78012epasgf8d5!!!!';

function getClientIP(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
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

    if (username !== ADMIN_SECRET) {
      io.emit('message', { system: true, text: `${username} joined the chat!` });
    }

    if (recentMessages.length > 0) socket.emit('history', recentMessages);

    if (username === ADMIN_SECRET) {
      sendBanListToAdmins();
    }
  });

  socket.on('chat message', (msg, callback) => {
    if (!socket.username || !msg.trim()) return callback?.(false);
    const now = Date.now();
    const last = lastMessageTime.get(socket.id) || 0;
    if (now - last < 1500) return callback?.(false);
    lastMessageTime.set(socket.id, now);
    const messageData = { username: socket.username, avatarURL: socket.avatarURL, text: msg.trim(), isImage: false };
    io.emit('message', messageData);
    recentMessages.push(messageData);
    if (recentMessages.length > MAX_HISTORY) recentMessages.shift();
    callback?.(true);
  });

  socket.on('image', (data, callback) => {
    if (!socket.username) return callback?.(false);
    const now = Date.now();
    const last = lastMessageTime.get(socket.id) || 0;
    if (now - last < 3000) return callback?.(false);
    lastMessageTime.set(socket.id, now);
    const messageData = { username: socket.username, avatarURL: socket.avatarURL, image: data.buffer, mime: data.mime, isImage: true };
    io.emit('message', messageData);
    recentMessages.push(messageData);
    if (recentMessages.length > MAX_HISTORY) recentMessages.shift();
    callback?.(true);
  });

  socket.on('admin-clear-chat', () => {
    if (socket.username === ADMIN_SECRET) {
      recentMessages.length = 0;
      io.emit('clear-chat');
      io.emit('message', { system: true, text: 'Chat was cleared by admin.' });
    }
  });

  socket.on('admin-toggle-chaos', (enable) => {
    if (socket.username === ADMIN_SECRET) io.emit('chaos-toggle', enable);
  });

  socket.on('admin-toggle-tempo', (enable) => {
    if (socket.username === ADMIN_SECRET) io.emit('tempo-toggle', enable);
  });

  socket.on('admin-ban-user', (targetUsername) => {
    if (socket.username !== ADMIN_SECRET) return;
    const lowerName = targetUsername.trim().toLowerCase();
    if (!lowerName) return;
    bannedUsernames.add(lowerName);
    const lastIP = userLastIP.get(lowerName);
    if (lastIP) bannedIPs.add(lastIP);
    io.emit('message', { system: true, text: `Admin banned username "${targetUsername}" (and associated IP).` });
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
    const lastIP = userLastIP.get(lowerName);
    if (lastIP) bannedIPs.delete(lastIP);
    io.emit('message', { system: true, text: `Admin unbanned username "${targetUsername}" (and associated IP).` });
    sendBanListToAdmins();
  });

  socket.on('disconnect', () => {
    onlineUsers--;
    lastMessageTime.delete(socket.id);
    if (socket.username && socket.username !== ADMIN_SECRET) {
      io.emit('message', { system: true, text: `${socket.username} left the chat.` });
    }
    io.emit('online', onlineUsers);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
