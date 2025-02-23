const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { Worker } = require("worker_threads"); // Worker Threads for CPU Load

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = socketIo(server, { 
  cors: { origin: "*" }, 
  pingInterval: 500, // More frequent pings
  pingTimeout: 2000, // Faster timeout for connection stability
});

// **🔥 Optimized Memory-Only Storage**
let rooms = {};
let hosts = {};
let roomCode = {};
let typingUsers = {};
let chatHistory = {};
let commitHistory = {};
let sharedCode = {};

// **🚀 High CPU Load Simulation with Worker Threads**
const heavyComputation = () => {
  return new Promise((resolve) => {
    const worker = new Worker("./heavyWorker.js"); // External Worker Thread
    worker.on("message", resolve);
    worker.postMessage("start");
  });
};

// **🔄 High-Frequency Code Updates**
const codeUpdateTimers = {};
const debounceTime = 50; // Lower debounce for high update rate

io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  socket.on("join-room", async ({ roomId, username }) => {
    socket.join(roomId);

    rooms[roomId] = rooms[roomId] || [];
    hosts[roomId] = hosts[roomId] || username;
    roomCode[roomId] = roomCode[roomId] || {};
    chatHistory[roomId] = chatHistory[roomId] || [];
    commitHistory[roomId] = commitHistory[roomId] || [];

    if (!rooms[roomId].includes(username)) rooms[roomId].push(username);

    io.to(socket.id).emit("sync-all-code", roomCode[roomId]);
    io.to(socket.id).emit("chat-history", chatHistory[roomId]);
    io.to(socket.id).emit("commit-history", commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`));
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);

    // **🔥 Trigger Heavy Computation to Load CPU**
    await heavyComputation();
  });

  // **🚀 Frequent Code Updates for Real-Time Typing**
  socket.on("code-update", ({ roomId, code, language }) => {
    if (!roomCode[roomId]) roomCode[roomId] = {};
    roomCode[roomId][language] = code;

    if (codeUpdateTimers[roomId]) clearTimeout(codeUpdateTimers[roomId]);

    codeUpdateTimers[roomId] = setTimeout(() => {
      io.to(roomId).emit("code-update", { code, language });
    }, debounceTime);
  });

  // **🔥 High CPU Task on Message Send**
  socket.on("send-message", async ({ roomId, username, message }) => {
    if (!chatHistory[roomId]) chatHistory[roomId] = [];
    chatHistory[roomId].push({ username, message });

    io.to(roomId).emit("receive-message", { username, message });

    // **🔥 Simulate Heavy CPU Task on Each Message**
    await heavyComputation();
  });

  socket.on("leave-room", ({ roomId, username }) => {
    if (!rooms[roomId]) return;
    rooms[roomId] = rooms[roomId].filter(user => user !== username);
    if (hosts[roomId] === username) hosts[roomId] = rooms[roomId][0] || null;

    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  socket.on("disconnect", () => {
    for (const room in rooms) {
      rooms[room] = rooms[room].filter(user => user !== socket.id);
      if (hosts[room] === socket.id) hosts[room] = rooms[room][0] || null;
    }
  });
});

// **🔥 Run Server with CPU Load**
server.listen(PORT, async () => {
  console.log(`🔥 High-Performance Server Running on port ${PORT}`);
  await heavyComputation();
});
