const fs = require("fs");
const path = require("path");
const Redis = require("ioredis");
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

// Connect to Redis
const redis = new Redis({
  host: "profound-tapir-19932.upstash.io",  // Default Redis host
  port: 6379,         // Default Redis port
  password: "AU3cAAIjcDEzYTRjNjljYWZhZmM0YTE1OTIwZTAxN2UzNDdkMzFmYnAxMA", // Uncomment if you have a password
});

// Data file for backup (keep this as a backup option)
const DATA_FILE = path.join(__dirname, "data.json");

// Initialize in-memory data structures
let rooms = {};
let hosts = {};
let typingUsers = {};
let roomCode = {};
let sharedCode = {};
let commitHistory = {};
let chatHistory = {};

// Load initial data from file (as a fallback)
try {
  if (fs.existsSync(DATA_FILE)) {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    rooms = data.rooms || {};
    hosts = data.hosts || {};
    roomCode = data.roomCode || {};
    sharedCode = data.sharedCode || {};
    commitHistory = data.commitHistory || {};
    chatHistory = data.chatHistory || {};
    
    // Convert typing users to Sets
    typingUsers = {};
    for (const roomId in data.typingUsers || {}) {
      if (Array.isArray(data.typingUsers[roomId])) {
        typingUsers[roomId] = new Set(data.typingUsers[roomId]);
      } else {
        typingUsers[roomId] = new Set();
      }
    }
  }
} catch (error) {
  console.error("Error loading data from file:", error);
}

// Function to save data to Redis (with rate limiting)
const saveTimeouts = {};
async function saveToRedis(key, data, delay = 2000) {
  clearTimeout(saveTimeouts[key]);
  
  saveTimeouts[key] = setTimeout(async () => {
    try {
      await redis.set(key, JSON.stringify(data));
    } catch (err) {
      console.error(`Error saving ${key} to Redis:`, err);
      
      // Fallback to file save every 10 minutes
      if (key === 'full_backup' && !saveTimeouts.file_backup) {
        saveTimeouts.file_backup = setTimeout(() => {
          try {
            fs.writeFileSync(
              DATA_FILE,
              JSON.stringify({
                rooms, hosts, typingUsers: Object.fromEntries(
                  Object.entries(typingUsers).map(([k, v]) => [k, Array.from(v)])
                ),
                roomCode, commitHistory, sharedCode, chatHistory
              }, null, 2)
            );
            console.log("Backup saved to file");
          } catch (err) {
            console.error("Error saving backup to file:", err);
          }
          delete saveTimeouts.file_backup;
        }, 600000); // 10 minutes
      }
    }
  }, delay);
}

// Track socket to room mappings
const socketRooms = new Map();

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  socket.on("join-room", async ({ roomId, username }) => {
    // Store connection info
    socketRooms.set(socket.id, { roomId, username });
    socket.join(roomId);

    // Try to get room data from Redis first
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
      console.error(`Error loading room ${roomId} from Redis:`, err);
    }

    // Initialize room if needed
    if (!rooms[roomId]) {
      rooms[roomId] = [];
      hosts[roomId] = username;
      roomCode[roomId] = {};
      chatHistory[roomId] = [];
      commitHistory[roomId] = [];
    }

    // Add user to room
    if (!rooms[roomId].includes(username)) {
      rooms[roomId].push(username);
    }

    // Initialize typing users set
    if (!typingUsers[roomId]) {
      typingUsers[roomId] = new Set();
    }

    // Save room data to Redis
    saveToRedis(`room:${roomId}`, {
      users: rooms[roomId],
      host: hosts[roomId],
      code: roomCode[roomId],
      commits: commitHistory[roomId],
      chat: chatHistory[roomId]
    });

    // Send data to client
    socket.emit("sync-all-code", roomCode[roomId]);
    socket.emit("chat-history", chatHistory[roomId]);
    socket.emit("commit-history", { 
      commits: (commitHistory[roomId] || []).map(c => `${c.commitHash} - ${c.commitMessage}`) 
    });
    
    // Broadcast user list and host
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  // Optimize code updates with throttling
  const lastCodeUpdate = {};
  
  socket.on("code-update", ({ roomId, code, language }) => {
    const now = Date.now();
    const key = `${roomId}-${language}`;
    
    // Throttle updates (100ms minimum between updates)
    if (lastCodeUpdate[key] && (now - lastCodeUpdate[key] < 100)) {
      return;
    }
    
    lastCodeUpdate[key] = now;
    
    // Update code
    if (!roomCode[roomId]) roomCode[roomId] = {};
    roomCode[roomId][language] = code;
    
    // Save to Redis (with 2 second delay to batch updates)
    saveToRedis(`room:${roomId}`, {
      users: rooms[roomId],
      host: hosts[roomId],
      code: roomCode[roomId],
      commits: commitHistory[roomId],
      chat: chatHistory[roomId]
    });
    
    // Broadcast to everyone except sender
    socket.to(roomId).emit("code-update", { code, language });
  });

  // Handle typing indicators with debounce
  const typingTimeouts = {};
  
  socket.on("typing", ({ roomId, username }) => {
    if (!typingUsers[roomId]) typingUsers[roomId] = new Set();
    
    // Clear existing timeout
    if (typingTimeouts[`${roomId}-${username}`]) {
      clearTimeout(typingTimeouts[`${roomId}-${username}`]);
    }
    
    // Check if status changed
    const wasTyping = typingUsers[roomId].has(username);
    typingUsers[roomId].add(username);
    
    if (!wasTyping) {
      io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
    }
    
    // Auto-clear after 2 seconds
    typingTimeouts[`${roomId}-${username}`] = setTimeout(() => {
      if (typingUsers[roomId]) {
        typingUsers[roomId].delete(username);
        io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
      }
    }, 2000);
  });

  // Chat messages with rate limiting
  const lastChatTime = {};
  
  socket.on("send-message", ({ roomId, username, message }) => {
    const now = Date.now();
    const key = `${roomId}-${username}`;
    
    // Rate limit messages (500ms minimum between messages)
    if (lastChatTime[key] && (now - lastChatTime[key] < 500)) {
      return;
    }
    
    lastChatTime[key] = now;
    
    if (!chatHistory[roomId]) chatHistory[roomId] = [];
    
    const chatMessage = { 
      username, 
      message, 
      timestamp: now
    };

    // Limit history to last 100 messages
    if (chatHistory[roomId].length > 100) {
      chatHistory[roomId] = chatHistory[roomId].slice(-100);
    }

    chatHistory[roomId].push(chatMessage);
    
    // Save to Redis
    saveToRedis(`room:${roomId}`, {
      users: rooms[roomId],
      host: hosts[roomId],
      code: roomCode[roomId],
      commits: commitHistory[roomId],
      chat: chatHistory[roomId]
    });
    
    io.to(roomId).emit("receive-message", chatMessage);
  });

  // Handle disconnects
  socket.on("disconnect", () => {
    const userInfo = socketRooms.get(socket.id);
    if (userInfo) {
      const { roomId, username } = userInfo;
      handleUserLeave(roomId, username);
      socketRooms.delete(socket.id);
    }
  });

  // Handle user leaving
  socket.on("leave-room", ({ roomId, username }) => {
    handleUserLeave(roomId, username);
  });

  // Helper function for user leaving
  function handleUserLeave(roomId, username) {
    if (rooms[roomId]) {
      // Remove user
      rooms[roomId] = rooms[roomId].filter(user => user !== username);
      
      // Clear typing status
      if (typingUsers[roomId]) {
        typingUsers[roomId].delete(username);
        io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
      }
      
      // Reassign host if needed
      if (hosts[roomId] === username) {
        hosts[roomId] = rooms[roomId].length > 0 ? rooms[roomId][0] : null;
        io.to(roomId).emit("server-owner", hosts[roomId]);
      }
      
      // Broadcast updated user list
      io.to(roomId).emit("user-list", rooms[roomId]);
      
      // Save to Redis
      saveToRedis(`room:${roomId}`, {
        users: rooms[roomId],
        host: hosts[roomId],
        code: roomCode[roomId],
        commits: commitHistory[roomId],
        chat: chatHistory[roomId]
      });
    }
  }

  // Implement other event handlers similarly...
  // (commits, language updates, etc.)
});

// Cleanup old data every hour
setInterval(async () => {
  // Save full backup to Redis
  saveToRedis('full_backup', {
    rooms, hosts, 
    typingUsers: Object.fromEntries(
      Object.entries(typingUsers).map(([k, v]) => [k, Array.from(v)])
    ),
    roomCode, commitHistory, sharedCode, chatHistory
  });
  
  // Clean empty rooms
  const now = Date.now();
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  
  // Cleanup old shared code
  Object.keys(sharedCode).forEach(shareId => {
    if (sharedCode[shareId].createdAt && (now - sharedCode[shareId].createdAt > ONE_WEEK)) {
      delete sharedCode[shareId];
    }
  });
}, 3600000); // Every hour

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
