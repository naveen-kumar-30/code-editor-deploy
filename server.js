const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: { origin: "*" },
  // Optimize Socket.IO for minimal latency
  transports: ['websocket'],
  upgrade: false,
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6 // 1MB buffer for larger code updates
});

// Data file for JSON storage
const DATA_FILE = path.join(__dirname, "data.json");
const DATA_DIR = path.join(__dirname, "rooms");

// Ensure the rooms directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize in-memory data structures
let rooms = {};
let hosts = {};
let typingUsers = {};
let roomCode = {};
let sharedCode = {};
let commitHistory = {};
let chatHistory = {};
let roomCursors = {}; // Track all cursors by room

// Load initial data from file
try {
  if (fs.existsSync(DATA_FILE)) {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    rooms = data.rooms || {};
    hosts = data.hosts || {};
    roomCode = data.roomCode || {};
    sharedCode = data.sharedCode || {};
    commitHistory = data.commitHistory || {};
    chatHistory = data.chatHistory || {};
    roomCursors = data.roomCursors || {};
    
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

// Background save system using debounced writes
const pendingWrites = new Map();
let isWriting = false;
const writeDebounceTime = 2000; // 2 seconds debounce time
const writeTimeouts = new Map();

// Function to write room data without blocking
async function writeRoomData() {
  if (isWriting || pendingWrites.size === 0) return;
  
  isWriting = true;
  const entries = Array.from(pendingWrites.entries());
  pendingWrites.clear();
  
  for (const [roomId, data] of entries) {
    const roomFilePath = path.join(DATA_DIR, `${roomId}.json`);
    try {
      fs.writeFileSync(roomFilePath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(`Error saving room ${roomId} to JSON:`, err);
    }
  }
  
  isWriting = false;
  
  // Process any new writes that came in while we were writing
  if (pendingWrites.size > 0) {
    process.nextTick(writeRoomData);
  }
}

// Add room data to pending writes with debouncing
function queueRoomSave(roomId) {
  // Clear any existing timeout for this room
  if (writeTimeouts.has(roomId)) {
    clearTimeout(writeTimeouts.get(roomId));
  }
  
  // Set a new timeout for this room
  writeTimeouts.set(roomId, setTimeout(() => {
    pendingWrites.set(roomId, {
      users: rooms[roomId],
      host: hosts[roomId],
      code: roomCode[roomId],
      commits: commitHistory[roomId],
      chat: chatHistory[roomId],
      cursors: roomCursors[roomId]
    });
    
    // Trigger write on next tick to avoid blocking
    if (!isWriting) {
      process.nextTick(writeRoomData);
    }
    
    writeTimeouts.delete(roomId);
  }, writeDebounceTime));
}

// Track socket to room mappings
const socketRooms = new Map();

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);
  
  // Use binary protocol for faster transmission
  socket.binaryType = 'arraybuffer';

  socket.on("join-room", ({ roomId, username }) => {
    // Store connection info
    socketRooms.set(socket.id, { roomId, username });
    socket.join(roomId);

    // Try to get room data from JSON file
    const roomFilePath = path.join(DATA_DIR, `${roomId}.json`);
    try {
      if (fs.existsSync(roomFilePath)) {
        const parsedData = JSON.parse(fs.readFileSync(roomFilePath, "utf8"));
        rooms[roomId] = parsedData.users || [];
        hosts[roomId] = parsedData.host;
        roomCode[roomId] = parsedData.code || {};
        commitHistory[roomId] = parsedData.commits || [];
        chatHistory[roomId] = parsedData.chat || [];
        roomCursors[roomId] = parsedData.cursors || {};
      }
    } catch (err) {
      console.error(`Error loading room ${roomId} from JSON:`, err);
    }

    // Initialize room if needed
    if (!rooms[roomId]) {
      rooms[roomId] = [];
      hosts[roomId] = username;
      roomCode[roomId] = {};
      chatHistory[roomId] = [];
      commitHistory[roomId] = [];
      roomCursors[roomId] = {};
    }

    // Add user to room
    if (!rooms[roomId].includes(username)) {
      rooms[roomId].push(username);
    }

    // Initialize typing users set
    if (!typingUsers[roomId]) {
      typingUsers[roomId] = new Set();
    }
    
    // Initialize cursor tracking for room
    if (!roomCursors[roomId]) {
      roomCursors[roomId] = {};
    }

    // Send data to client
    socket.emit("sync-all-code", roomCode[roomId]);
    socket.emit("chat-history", chatHistory[roomId]);
    socket.emit("commit-history", { 
      commits: (commitHistory[roomId] || []).map(c => `${c.commitHash} - ${c.commitMessage}`) 
    });
    
    // Send all cursor positions
    socket.emit("sync-all-cursors", roomCursors[roomId]);
    
    // Broadcast user list and host
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
    
    // Queue background save
    queueRoomSave(roomId);
  });

  // Optimize code updates for true zero delay
  let lastCodeState = {};
  
  socket.on("code-update", ({ roomId, code, language, cursorPosition }) => {
    // Skip if this is identical to the last update (prevent re-renders)
    const stateKey = `${roomId}-${language}`;
    if (lastCodeState[stateKey] === code) return;
    
    // Update memory state
    lastCodeState[stateKey] = code;
    if (!roomCode[roomId]) roomCode[roomId] = {};
    roomCode[roomId][language] = code;
    
    // Update cursor position with the code update
    updateCursorPosition(roomId, socket.id, socketRooms.get(socket.id)?.username, cursorPosition, language);
    
    // Broadcast to everyone except sender INSTANTLY with cursor position
    socket.to(roomId).emit("code-update", { 
      code, 
      language,
      cursorPosition,
      userId: socket.id, // Send user ID to help client prevent unnecessary updates
      timestamp: Date.now() // Add timestamp to help with ordering
    });
    
    // Queue saving for background processing (with less frequent writes)
    queueRoomSave(roomId);
  });

  // Implement precise cursor position tracking with throttling
  const cursorThrottleTime = 50; // 50ms (20 updates per second max)
  const throttledCursors = new Map();
  
  function updateCursorPosition(roomId, userId, username, position, language) {
    // Initialize if needed
    if (!roomCursors[roomId]) roomCursors[roomId] = {};
    
    // Update cursor position in memory
    if (!roomCursors[roomId][userId]) {
      roomCursors[roomId][userId] = {
        username: username,
        positions: {}
      };
    }
    
    roomCursors[roomId][userId].username = username;
    roomCursors[roomId][userId].positions[language] = position;
    roomCursors[roomId][userId].timestamp = Date.now();
  }
  
  socket.on("cursor-position", ({ roomId, position, language }) => {
    const userInfo = socketRooms.get(socket.id);
    if (!userInfo) return;
    
    const username = userInfo.username;
    const userId = socket.id;
    const cursorKey = `${roomId}-${userId}-${language}`;
    
    // Throttle frequent updates
    if (throttledCursors.has(cursorKey)) {
      clearTimeout(throttledCursors.get(cursorKey));
    }
    
    // Update cursor immediately in memory
    updateCursorPosition(roomId, userId, username, position, language);
    
    // Throttle broadcast to other users
    throttledCursors.set(cursorKey, setTimeout(() => {
      // Broadcast cursor position to all other users in the room
      socket.to(roomId).emit("cursor-position", {
        userId,
        username,
        position,
        language,
        timestamp: Date.now()
      });
      
      throttledCursors.delete(cursorKey);
    }, cursorThrottleTime));
  });

  // Handle typing indicators
  let typingStatesByRoom = {};
  
  socket.on("typing", ({ roomId, username, isTyping }) => {
    if (!typingUsers[roomId]) typingUsers[roomId] = new Set();
    
    // Get current state for this room
    const roomKey = `${roomId}`;
    if (!typingStatesByRoom[roomKey]) typingStatesByRoom[roomKey] = {};
    
    // Check if state actually changed to avoid unnecessary broadcasts
    const currentState = typingStatesByRoom[roomKey][username] || false;
    if (currentState === isTyping) return;
    
    // Update state
    typingStatesByRoom[roomKey][username] = isTyping;
    
    if (isTyping) {
      typingUsers[roomId].add(username);
    } else {
      typingUsers[roomId].delete(username);
    }
    
    // Only broadcast if there was a real change
    io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
  });

  // Chat messages
  socket.on("send-message", ({ roomId, username, message }) => {
    if (!chatHistory[roomId]) chatHistory[roomId] = [];
    
    const chatMessage = { 
      username, 
      message, 
      timestamp: Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}` // Unique ID to help client prevent duplicate renders
    };

    // Limit history to last 100 messages
    if (chatHistory[roomId].length > 100) {
      chatHistory[roomId] = chatHistory[roomId].slice(-100);
    }

    chatHistory[roomId].push(chatMessage);
    
    // Broadcast message immediately
    io.to(roomId).emit("receive-message", chatMessage);
    
    // Queue background save
    queueRoomSave(roomId);
  });

  // Handle disconnects
  socket.on("disconnect", () => {
    const userInfo = socketRooms.get(socket.id);
    if (userInfo) {
      const { roomId, username } = userInfo;
      handleUserLeave(roomId, username, socket.id);
      socketRooms.delete(socket.id);
    }
  });

  // Handle user leaving
  socket.on("leave-room", ({ roomId, username }) => {
    handleUserLeave(roomId, username, socket.id);
  });

  // Helper function for user leaving
  function handleUserLeave(roomId, username, userId) {
    if (rooms[roomId]) {
      // Remove user
      rooms[roomId] = rooms[roomId].filter(user => user !== username);
      
      // Clear typing status
      if (typingUsers[roomId]) {
        typingUsers[roomId].delete(username);
        io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
      }
      
      // Remove cursor positions
      if (roomCursors[roomId] && roomCursors[roomId][userId]) {
        delete roomCursors[roomId][userId];
        // Broadcast cursor removal
        io.to(roomId).emit("cursor-removed", userId);
      }
      
      // Reassign host if needed
      if (hosts[roomId] === username) {
        hosts[roomId] = rooms[roomId].length > 0 ? rooms[roomId][0] : null;
        io.to(roomId).emit("server-owner", hosts[roomId]);
      }
      
      // Broadcast updated user list
      io.to(roomId).emit("user-list", rooms[roomId]);
      
      // Queue background save
      queueRoomSave(roomId);
    }
  }

  // Implement commit handling
  socket.on("create-commit", ({ roomId, username, commitHash, commitMessage }) => {
    if (!commitHistory[roomId]) commitHistory[roomId] = [];
    
    const commit = {
      username,
      commitHash,
      commitMessage,
      timestamp: Date.now(),
      code: JSON.parse(JSON.stringify(roomCode[roomId] || {}))
    };
    
    commitHistory[roomId].push(commit);
    
    // Broadcast commit
    io.to(roomId).emit("commit-created", {
      commitHash,
      commitMessage,
      username,
      id: commitHash // Use commit hash as ID to prevent duplicate renders
    });
    
    io.to(roomId).emit("commit-history", { 
      commits: commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`)
    });
    
    // Queue background save
    queueRoomSave(roomId);
  });
  
  // Batch cursor updates to reduce network traffic
  const CURSOR_BATCH_INTERVAL = 50; // 50ms batching
  let pendingCursorUpdates = {};
  let cursorUpdateTimer = null;
  
  function scheduleCursorBatch() {
    if (cursorUpdateTimer) return;
    
    cursorUpdateTimer = setTimeout(() => {
      // For each room with pending updates
      for (const roomId in pendingCursorUpdates) {
        // Send all cursor updates at once
        io.to(roomId).emit("cursor-batch-update", pendingCursorUpdates[roomId]);
      }
      
      // Reset
      pendingCursorUpdates = {};
      cursorUpdateTimer = null;
    }, CURSOR_BATCH_INTERVAL);
  }
  
  // Add new method to request all cursors
  socket.on("request-all-cursors", ({ roomId }) => {
    if (roomCursors[roomId]) {
      socket.emit("sync-all-cursors", roomCursors[roomId]);
    }
  });
});

// Save backup every 15 minutes without blocking real-time updates
setInterval(() => {
  // Use non-blocking write for full backup
  fs.writeFile(
    DATA_FILE,
    JSON.stringify({
      rooms, 
      hosts, 
      typingUsers: Object.fromEntries(
        Object.entries(typingUsers).map(([k, v]) => [k, Array.from(v)])
      ),
      roomCode, 
      commitHistory, 
      sharedCode, 
      chatHistory,
      roomCursors
    }, null, 2),
    (err) => {
      if (err) {
        console.error("Error saving full backup to file:", err);
      } else {
        console.log("Full backup saved to file");
      }
    }
  );
  
  // Cleanup old room files without blocking
  const now = Date.now();
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  
  fs.readdir(DATA_DIR, (err, files) => {
    if (err) {
      console.error("Error reading rooms directory:", err);
      return;
    }
    
    files.forEach(file => {
      const roomFilePath = path.join(DATA_DIR, file);
      fs.stat(roomFilePath, (err, stats) => {
        if (err) {
          console.error(`Error getting stats for ${file}:`, err);
          return;
        }
        
        // If file is older than one week and not accessed in last day
        if (now - stats.mtime.getTime() > ONE_WEEK &&
            now - stats.atime.getTime() > 24 * 60 * 60 * 1000) {
          fs.unlink(roomFilePath, (err) => {
            if (err) {
              console.error(`Error removing old room file ${file}:`, err);
            } else {
              console.log(`Removed old room file: ${file}`);
            }
          });
        }
      });
    });
  });
}, 900000); // Every 15 minutes

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
