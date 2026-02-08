const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

let onlineUsers = 0;
const recentMessages = [];
const MAX_HISTORY = 100;

const ADMIN_SECRET = '87a6d987asdt8yaguksdghfas7d6qo8d7ra78D65Aoderfa678dwi5radarwd6i7';

io.on('connection', (socket) => {
  console.log('A user connected');
  onlineUsers++;
  io.emit('online', onlineUsers);

  socket.on('join', (name) => {
    socket.username = name || 'Anonymous';
    io.emit('message', { system: true, text: `${socket.username} joined the chat!` });

    if (recentMessages.length > 0) {
      socket.emit('history', recentMessages);
    }
  });

  socket.on('chat message', (msg) => {
    if (socket.username && msg.trim()) {
      const messageData = { username: socket.username, text: msg.trim(), isImage: false };
      io.emit('message', messageData);

      recentMessages.push(messageData);
      if (recentMessages.length > MAX_HISTORY) recentMessages.shift();
    }
  });

  socket.on('image', (data) => {
    if (socket.username) {
      const messageData = {
        username: socket.username,
        image: data.buffer,
        mime: data.mime,
        isImage: true
      };
      io.emit('message', messageData);

      recentMessages.push(messageData);
      if (recentMessages.length > MAX_HISTORY) recentMessages.shift();
    }
  });

  // ADMIN CLEAR CHAT
  socket.on('admin-clear-chat', () => {
    if (socket.username === ADMIN_SECRET) {
      console.log('ADMIN CLEARED THE CHAT');
      recentMessages.length = 0;               // Clear server history
      io.emit('clear-chat');                   // Tell all clients to clear UI
      io.emit('message', {                     // Announce the clear
        system: true,
        text: 'Chat was cleared by an admin.'
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    onlineUsers--;
    if (socket.username) {
      io.emit('message', { system: true, text: `${socket.username} left the chat.` });
    }
    io.emit('online', onlineUsers);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
