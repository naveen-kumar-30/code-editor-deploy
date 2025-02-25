const fs = require("fs");
const path = require("path");
const Redis = require("ioredis");
const express = require("express");
const http = require("http");
const { throttle } = require("lodash");

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Connect to Redis
const redis = new Redis({
  host: "profound-tapir-19932.upstash.io",
  port: 6379,
  password: "AU3cAAIjcDEzYTRjNjljYWZhZmM0YTE1OTIwZTAxN2UzNDdkMzFmYnAxMA",
  tls: {}  // Enable TLS if needed
});

// Data file for backup (fallback option)
const DATA_FILE = path.join(__dirname, "data.json");

// In-memory structures
let rooms = {};
let hosts = {};
let typingUsers = {};
let roomCode = {};
let sharedCode = {};
let commitHistory = {};
let chatHistory = {};

// Load initial data from file (fallback)
try {
  if (fs.existsSync(DATA_FILE)) {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    rooms = data.rooms || {};
    hosts = data.hosts || {};
    roomCode = data.roomCode || {};
    sharedCode = data.sharedCode || {};
    commitHistory = data.commitHistory || {};
    chatHistory = data.chatHistory || {};

    // Convert typingUsers to Sets
    typingUsers = {};
    for (const roomId in data.typingUsers || {}) {
      typingUsers[roomId] = new Set(data.typingUsers[roomId] || []);
    }
  }
} catch (error) {
  console.error("Error loading data from file:", error);
}

// Save to Redis with debounce
const saveTimeouts = {};
const saveToRedis = throttle(async (key, data) => {
  try {
    await redis.set(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Error saving ${key} to Redis:`, err);
  }
}, 2000);

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("join-room", async ({ roomId, username }) => {
    socket.join(roomId);

    try {
      const roomData = await redis.get(`room:${roomId}`);
      if (roomData) {
        const parsedData = JSON.parse(roomData);
        rooms[roomId] = parsedData.users || [];
        hosts[roomId] = parsedData.host;
        roomCode[roomId] = parsedData.code || {};
        commitHistory[roomId] = parsedData.commits || [];
        chatHistory[roomId] = parsedData.chat || [];
      }
    } catch (err) {
      console.error(`Redis error loading room ${roomId}:`, err);
    }

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

    saveToRedis(`room:${roomId}`, {
      users: rooms[roomId],
      host: hosts[roomId],
      code: roomCode[roomId],
      commits: commitHistory[roomId],
      chat: chatHistory[roomId]
    });

    socket.emit("sync-all-code", roomCode[roomId]);
    socket.emit("chat-history", chatHistory[roomId]);
    socket.emit("commit-history", {
      commits: (commitHistory[roomId] || []).map(c => `${c.commitHash} - ${c.commitMessage}`)
    });

    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  // Throttle code updates
  socket.on("code-update", throttle(({ roomId, code, language }) => {
    if (!roomCode[roomId]) roomCode[roomId] = {};
    roomCode[roomId][language] = code;

    saveToRedis(`room:${roomId}`, {
      users: rooms[roomId],
      host: hosts[roomId],
      code: roomCode[roomId],
      commits: commitHistory[roomId],
      chat: chatHistory[roomId]
    });

    socket.to(roomId).emit("code-update", { code, language });
  }, 100));

  // Handle typing status
  socket.on("typing", ({ roomId, username }) => {
    if (!typingUsers[roomId]) typingUsers[roomId] = new Set();

    typingUsers[roomId].add(username);
    io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));

    setTimeout(() => {
      typingUsers[roomId].delete(username);
      io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
    }, 2000);
  });

  // Handle messages
  socket.on("send-message", throttle(({ roomId, username, message }) => {
    if (!chatHistory[roomId]) chatHistory[roomId] = [];

    const chatMessage = {
      username,
      message,
      timestamp: Date.now()
    };

    chatHistory[roomId].push(chatMessage);
    if (chatHistory[roomId].length > 100) {
      chatHistory[roomId] = chatHistory[roomId].slice(-100);
    }

    saveToRedis(`room:${roomId}`, {
      users: rooms[roomId],
      host: hosts[roomId],
      code: roomCode[roomId],
      commits: commitHistory[roomId],
      chat: chatHistory[roomId]
    });

    io.to(roomId).emit("receive-message", chatMessage);
  }, 500));

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

// Periodic cleanup every hour
setInterval(() => {
  saveToRedis("full_backup", {
    rooms,
    hosts,
    typingUsers: Object.fromEntries(Object.entries(typingUsers).map(([k, v]) => [k, Array.from(v)])),
    roomCode,
    commitHistory,
    sharedCode,
    chatHistory
  });

  const now = Date.now();
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

  Object.keys(sharedCode).forEach(shareId => {
    if (sharedCode[shareId]?.createdAt && (now - sharedCode[shareId].createdAt > ONE_WEEK)) {
      delete sharedCode[shareId];
    }
  });
}, 3600000);

// Start server
const PORT = process.env.PORT || 12000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
}).on("error", (err) => {
  console.error(`❌ Server failed to start: ${err.message}`);
});
