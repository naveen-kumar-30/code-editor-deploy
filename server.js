const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const DATA_FILE = path.join(__dirname, "data.json");

// Initialize in-memory storage
let rooms = {};
let hosts = {};
let roomCode = {};
let commitHistory = {};
let chatHistory = {};
let typingUsers = {};

// Load data from JSON file
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      rooms = data.rooms || {};
      hosts = data.hosts || {};
      roomCode = data.roomCode || {};
      commitHistory = data.commitHistory || {};
      chatHistory = data.chatHistory || {};
      typingUsers = Object.fromEntries(
        Object.entries(data.typingUsers || {}).map(([k, v]) => [k, new Set(v)])
      );
    }
  } catch (error) {
    console.error("Error loading data:", error);
  }
}
loadData();

// Debounced save function
let saveTimeout = null;
function saveData() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify({
      rooms,
      hosts,
      roomCode,
      commitHistory,
      chatHistory,
      typingUsers: Object.fromEntries(
        Object.entries(typingUsers).map(([k, v]) => [k, Array.from(v)])
      ),
    }, null, 2), (err) => {
      if (err) console.error("Error saving data:", err);
    });
  }, 500);
}

// Store socket-user mappings
const socketRooms = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

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
      commits: (commitHistory[roomId] || []).map(
        (c) => `${c.commitHash} - ${c.commitMessage}`
      ),
    });

    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  socket.on("code-update", ({ roomId, code, language }) => {
    if (!roomCode[roomId]) roomCode[roomId] = {};
    roomCode[roomId][language] = code;

    io.to(roomId).emit("code-update", { code, language });

    saveData();
  });

  socket.on("typing", ({ roomId, username }) => {
    if (!typingUsers[roomId]) typingUsers[roomId] = new Set();
    typingUsers[roomId].add(username);

    io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
  });

  socket.on("send-message", ({ roomId, username, message }) => {
    if (!chatHistory[roomId]) chatHistory[roomId] = [];

    const chatMessage = { username, message, timestamp: Date.now() };

    chatHistory[roomId].push(chatMessage);
    if (chatHistory[roomId].length > 100) {
      chatHistory[roomId] = chatHistory[roomId].slice(-100);
    }

    io.to(roomId).emit("receive-message", chatMessage);

    saveData();
  });

  socket.on("disconnect", () => {
    const userInfo = socketRooms.get(socket.id);
    if (userInfo) {
      handleUserLeave(userInfo.roomId, userInfo.username);
      socketRooms.delete(socket.id);
    }
  });

  socket.on("leave-room", ({ roomId, username }) => {
    handleUserLeave(roomId, username);
  });

  function handleUserLeave(roomId, username) {
    if (rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter((user) => user !== username);

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

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
