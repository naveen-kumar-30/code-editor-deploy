const fs = require("fs");
const path = require("path");
const io = require("socket.io")(5000, {
  cors: { origin: "*" },
  pingTimeout: 60000, // Increase timeout for better connection stability
  pingInterval: 25000 // Optimize heartbeat interval
});

const DATA_FILE = path.join(__dirname, "data.json");

// Load existing data with proper error handling
let { rooms, hosts, typingUsers, roomCode, sharedCode, commitHistory = {} } = loadData();
let chatHistory = loadData().chatHistory || {}; // Ensure chat history is loaded from file

// Debounce save operations
let saveTimeout = null;
const SAVE_DELAY = 2000; // 2 seconds delay between saves

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (error) {
    console.error("Error loading data:", error);
  }
  return { 
    rooms: {}, 
    hosts: {}, 
    typingUsers: {}, 
    roomCode: {}, 
    sharedCode: {}, 
    commitHistory: {},
    chatHistory: {} 
  };
}

function saveData() {
  // Debounce save operations to prevent disk I/O bottlenecks
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(
        DATA_FILE, 
        JSON.stringify({ 
          rooms, 
          hosts, 
          typingUsers, 
          roomCode, 
          commitHistory, 
          sharedCode,
          chatHistory 
        }, null, 2)
      );
    } catch (error) {
      console.error("Error saving data:", error);
    }
  }, SAVE_DELAY);
}

// Convert typingUsers to proper structure during initialization
for (const roomId in typingUsers) {
  if (typeof typingUsers[roomId] === 'object' && !Array.isArray(typingUsers[roomId]) && !(typingUsers[roomId] instanceof Set)) {
    typingUsers[roomId] = new Set(Object.values(typingUsers[roomId]));
  } else if (Array.isArray(typingUsers[roomId])) {
    typingUsers[roomId] = new Set(typingUsers[roomId]);
  } else if (!(typingUsers[roomId] instanceof Set)) {
    typingUsers[roomId] = new Set();
  }
}

// Track socket to room and username mapping for better disconnect handling
const socketRooms = new Map();

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
    // Track which room and username this socket belongs to
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

    // Only save after completing all join operations
    saveData();

    // Emit events individually to reduce payload size
    socket.emit("sync-all-code", roomCode[roomId]);
    socket.emit("chat-history", chatHistory[roomId]);
    socket.emit("commit-history", { 
      commits: (commitHistory[roomId] || []).map(c => `${c.commitHash} - ${c.commitMessage}`) 
    });
    
    // Broadcast updated user list to everyone in the room
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  // Optimize code update with throttling
  let lastCodeUpdate = {};
  
  socket.on("code-update", ({ roomId, code, language }) => {
    const now = Date.now();
    const key = `${roomId}-${language}`;
    
    // Throttle updates to once per 100ms per language per room
    if (lastCodeUpdate[key] && (now - lastCodeUpdate[key] < 100)) {
      return;
    }
    
    lastCodeUpdate[key] = now;
    
    if (!roomCode[roomId]) roomCode[roomId] = {};
    roomCode[roomId][language] = code;
    saveData();
    
    // Broadcast to everyone except sender to reduce network traffic
    socket.to(roomId).emit("code-update", { code, language });
  });

  socket.on("language-update", ({ roomId, language }) => {
    let savedCode = roomCode[roomId]?.[language] || "// Start coding...";
    socket.emit("language-update", { language, code: savedCode });
  });

  // Optimize typing indicators with debouncing
  const typingTimeouts = {};
  
  socket.on("typing", ({ roomId, username }) => {
    if (!typingUsers[roomId]) typingUsers[roomId] = new Set();
    
    // Clear existing timeout if any
    if (typingTimeouts[`${roomId}-${username}`]) {
      clearTimeout(typingTimeouts[`${roomId}-${username}`]);
    }
    
    // Only emit if user wasn't already typing
    const wasTyping = typingUsers[roomId].has(username);
    typingUsers[roomId].add(username);
    
    if (!wasTyping) {
      io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
    }
    
    // Auto-clear typing status after 2 seconds of inactivity
    typingTimeouts[`${roomId}-${username}`] = setTimeout(() => {
      if (typingUsers[roomId]) {
        typingUsers[roomId].delete(username);
        io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
      }
    }, 2000);
  });

  socket.on("stop-typing", ({ roomId, username }) => {
    if (typingUsers[roomId]) {
      // Clear any existing timeout
      if (typingTimeouts[`${roomId}-${username}`]) {
        clearTimeout(typingTimeouts[`${roomId}-${username}`]);
        delete typingTimeouts[`${roomId}-${username}`];
      }
      
      typingUsers[roomId].delete(username);
      io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
    }
  });

  // Handle chat messages with timestamps
  socket.on("send-message", ({ roomId, username, message }) => {
    if (!chatHistory[roomId]) chatHistory[roomId] = [];
    const chatMessage = { 
      username, 
      message, 
      timestamp: Date.now() // Add timestamp for ordering
    };

    // Limit chat history to 100 messages per room to prevent memory issues
    if (chatHistory[roomId].length > 100) {
      chatHistory[roomId] = chatHistory[roomId].slice(-100);
    }

    chatHistory[roomId].push(chatMessage);
    io.to(roomId).emit("receive-message", chatMessage);
    saveData();
  });

  socket.on("leave-room", ({ roomId, username }) => {
    handleUserLeave(socket.id, roomId, username);
  });

  socket.on("disconnect", () => {
    const userInfo = socketRooms.get(socket.id);
    if (userInfo) {
      handleUserLeave(socket.id, userInfo.roomId, userInfo.username);
      socketRooms.delete(socket.id);
    }
  });

  // Helper function to handle both manual leave and disconnects
  function handleUserLeave(socketId, roomId, username) {
    if (rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter((user) => user !== username);
      
      // Clean up typing status
      if (typingUsers[roomId]) {
        typingUsers[roomId].delete(username);
        io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
      }
      
      // Handle host reassignment
      if (hosts[roomId] === username) {
        hosts[roomId] = rooms[roomId].length > 0 ? rooms[roomId][0] : null;
        io.to(roomId).emit("server-owner", hosts[roomId]);
      }
      
      // Broadcast updated user list
      io.to(roomId).emit("user-list", rooms[roomId]);
      saveData();
    }
  }

  // Handle commits with deduplication
  socket.on("commit-code", ({ roomId, code, language, commitMessage }) => {
    if (!commitHistory[roomId]) commitHistory[roomId] = [];

    const timestamp = new Date().toISOString();
    const commitHash = `${timestamp}-${Math.random().toString(36).substring(2, 5)}`;
    
    // Check for duplicate commits (same code within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const isDuplicate = commitHistory[roomId].some(c => 
      c.language === language && 
      c.code === code && 
      c.timestamp > fiveMinutesAgo
    );
    
    if (!isDuplicate) {
      const commitEntry = { commitHash, timestamp, commitMessage, language, code };
      
      // Limit commit history to 50 per room
      if (commitHistory[roomId].length > 50) {
        commitHistory[roomId] = commitHistory[roomId].slice(-50);
      }
      
      commitHistory[roomId].push(commitEntry);
      saveData();
      
      io.to(roomId).emit("commit-history", { 
        commits: commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`) 
      });
    }
  });

  socket.on("get-commit-history", ({ roomId }) => {
    socket.emit("commit-history", { 
      commits: commitHistory[roomId] ? 
        commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`) : [] 
    });
  });

  socket.on("restore-code", ({ roomId, commitHash }) => {
    const commit = commitHistory[roomId]?.find(c => c.commitHash === commitHash);
    if (commit) {
      if (!roomCode[roomId]) roomCode[roomId] = {};
      roomCode[roomId][commit.language] = commit.code;
      saveData();

      // Send restored code and language to all users in the room
      io.to(roomId).emit("code-update", { code: commit.code, language: commit.language });
      io.to(roomId).emit("language-update", { language: commit.language, code: commit.code });
    }
  });

  // Handle shareable links with expiration
  socket.on("generate-shareable-link", ({ code }) => {
    const shareId = Math.random().toString(36).substring(2, 9);
    sharedCode[shareId] = {
      code,
      createdAt: Date.now() // Add creation timestamp for potential future cleanup
    };
    saveData();

    const shareUrl = `http://localhost:3000/codeeditor?shared=${shareId}`;
    socket.emit("shareable-link", { shareUrl });
  });

  socket.on("load-shared-code", ({ shareId }) => {
    const sharedCodeData = sharedCode[shareId];
    if (sharedCodeData) {
      socket.emit("shared-code-loaded", { code: sharedCodeData.code });
    } else {
      socket.emit("shared-code-error", { message: "Shared code not found!" });
    }
  });
});

// Cleanup expired shared code and inactive rooms every hour
setInterval(() => {
  const now = Date.now();
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  
  // Clean up old shared code links (older than 1 week)
  Object.keys(sharedCode).forEach(shareId => {
    if (sharedCode[shareId].createdAt && (now - sharedCode[shareId].createdAt > ONE_WEEK)) {
      delete sharedCode[shareId];
    }
  });
  
  // Clean up empty rooms that have been inactive for a week
  Object.keys(rooms).forEach(roomId => {
    if (rooms[roomId].length === 0) {
      // Check last activity through commit history
      const lastCommit = commitHistory[roomId]?.[commitHistory[roomId]?.length - 1];
      const lastActivity = lastCommit ? new Date(lastCommit.timestamp).getTime() : 0;
      
      if (now - lastActivity > ONE_WEEK) {
        delete rooms[roomId];
        delete hosts[roomId];
        delete typingUsers[roomId];
        delete roomCode[roomId];
        delete chatHistory[roomId];
        delete commitHistory[roomId];
      }
    }
  });
  
  saveData();
}, 3600000); // Run every hour
