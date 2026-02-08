const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

let onlineUsers = 0;
const recentMessages = [];
const MAX_HISTORY = 100;
const userAvatars = {};
const lastMessageTime = new Map();
const ADMIN_SECRET = 'Admin-87a6d987asdt8yaguksdghfas7d!';

io.on('connection', (socket) => {
  onlineUsers++;
  io.emit('online', onlineUsers);

  socket.on('join', (data) => {
    const { name, avatarURL } = data;
    socket.username = name || 'Anonymous';
    socket.avatarURL = avatarURL || '';
    userAvatars[name] = socket.avatarURL;
    io.emit('message', { system: true, text: `${socket.username} joined the chat!` });
    if (recentMessages.length > 0) socket.emit('history', recentMessages);
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
    const messageData = { username: socket.username, avatarURL: socket.avatarURL, text: msg.trim(), isImage: false };
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
    const messageData = { username: socket.username, avatarURL: socket.avatarURL, image: data.buffer, mime: data.mime, isImage: true };
    io.emit('message', messageData);
    recentMessages.push(messageData);
    if (recentMessages.length > MAX_HISTORY) recentMessages.shift();
    if (callback) callback(true);
  });

  socket.on('admin-clear-chat', () => {
    if (socket.username === ADMIN_SECRET) {
      recentMessages.length = 0;
      Object.keys(userAvatars).forEach(k => delete userAvatars[k]);
      lastMessageTime.clear();
      io.emit('clear-chat');
      io.emit('message', { system: true, text: 'Chat was cleared by an admin.' });
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
server.listen(PORT);
