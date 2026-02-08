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
      if (recentMessages.length > MAX_HISTORY) {
        recentMessages.shift();  
      }
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
      if (recentMessages.length > MAX_HISTORY) {
        recentMessages.shift();
      }
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
