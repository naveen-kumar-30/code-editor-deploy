const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Data file for JSON storage
const DATA_FILE = path.join(__dirname, "data.json");

// Initialize in-memory data structures
let rooms = {};
let hosts = {};
let typingUsers = {};
let roomCode = {};
let sharedCode = {};
let commitHistory = {};
let chatHistory = {};

// Load initial data from file
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      rooms = data.rooms || {};
      hosts = data.hosts || {};
      roomCode = data.roomCode || {};
      sharedCode = data.sharedCode || {};
      commitHistory = data.commitHistory || {};
      chatHistory = data.chatHistory || {};
      typingUsers = {};
      for (const roomId in data.typingUsers || {}) {
        typingUsers[roomId] = new Set(data.typingUsers[roomId] || []);
      }
    }
  } catch (error) {
    console.error("Error loading data from file:", error);
  }
}

// Save data to file
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      rooms,
      hosts,
      typingUsers: Object.fromEntries(Object.entries(typingUsers).map(([k, v]) => [k, [...v]])),
      roomCode,
      sharedCode,
      commitHistory,
      chatHistory
    }, null, 2));
  } catch (err) {
    console.error("Error saving data to file:", err);
  }
}

// Load data initially
loadData();

// Track socket to room mappings
const socketRooms = new Map();

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
    socketRooms.set(socket.id, { roomId, username });
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = [];
      hosts[roomId] = username;
      roomCode[roomId] = {};
      chatHistory[roomId] = [];
      commitHistory[roomId] = [];
    }

    if (!rooms[roomId].includes(username)) {
      rooms[roomId].push(username);
    }

    if (!typingUsers[roomId]) {
      typingUsers[roomId] = new Set();
    }

    saveData();
    
    socket.emit("sync-all-code", roomCode[roomId]);
    socket.emit("chat-history", chatHistory[roomId]);
    socket.emit("commit-history", {
      commits: (commitHistory[roomId] || []).map(c => `${c.commitHash} - ${c.commitMessage}`)
    });
    
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  socket.on("code-update", ({ roomId, code, language }) => {
    if (!roomCode[roomId]) roomCode[roomId] = {};
    roomCode[roomId][language] = code;
    saveData();
    socket.to(roomId).emit("code-update", { code, language });
  });

  socket.on("send-message", ({ roomId, username, message }) => {
    if (!chatHistory[roomId]) chatHistory[roomId] = [];
    chatHistory[roomId].push({ username, message, timestamp: Date.now() });
    if (chatHistory[roomId].length > 100) {
      chatHistory[roomId] = chatHistory[roomId].slice(-100);
    }
    saveData();
    io.to(roomId).emit("receive-message", chatHistory[roomId].slice(-1)[0]);
  });

  socket.on("disconnect", () => {
    const userInfo = socketRooms.get(socket.id);
    if (userInfo) {
      const { roomId, username } = userInfo;
      handleUserLeave(roomId, username);
      socketRooms.delete(socket.id);
    }
  });

  function handleUserLeave(roomId, username) {
    if (rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(user => user !== username);
      if (typingUsers[roomId]) {
        typingUsers[roomId].delete(username);
        io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
      }
      if (hosts[roomId] === username) {
        hosts[roomId] = rooms[roomId].length > 0 ? rooms[roomId][0] : null;
        io.to(roomId).emit("server-owner", hosts[roomId]);
      }
      io.to(roomId).emit("user-list", rooms[roomId]);
      saveData();
    }
  }
});

// Cleanup shared code every hour
setInterval(() => {
  const now = Date.now();
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  Object.keys(sharedCode).forEach(shareId => {
    if (sharedCode[shareId].createdAt && (now - sharedCode[shareId].createdAt > ONE_WEEK)) {
      delete sharedCode[shareId];
    }
  });
  saveData();
}, 3600000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
