const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }  // Allows frontend from anywhere (Vercel)
});

let onlineUsers = 0;

io.on('connection', (socket) => {
  console.log('A user connected');
  onlineUsers++;
  io.emit('online', onlineUsers);

  socket.on('join', (name) => {
    socket.username = name || 'Anonymous';
    io.emit('message', { system: true, text: `${socket.username} joined the chat!` });
  });

  socket.on('chat message', (msg) => {
    if (socket.username && msg.trim()) {
      io.emit('message', { username: socket.username, text: msg.trim() });
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
