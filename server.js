const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const io = new Server(5000, { cors: { origin: "*" } });

const DATA_FILE = path.join(__dirname, "data.json");

// Load existing data or initialize empty
let { rooms, hosts, typingUsers, roomCode, sharedCode, commitHistory } = loadData();
let chatHistory = {};  // ✅ Stores chat messages for each room

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (error) {
    console.error("Error loading data:", error);
  }
  return { rooms: {}, hosts: {}, typingUsers: {}, roomCode: {}, sharedCode: {}, commitHistory: {} };
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ rooms, hosts, typingUsers, roomCode, chatHistory, commitHistory, sharedCode }, null, 2));
}

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
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

    saveData();

    io.to(socket.id).emit("sync-all-code", roomCode[roomId]);
    io.to(socket.id).emit("chat-history", chatHistory[roomId] || []);
    io.to(socket.id).emit("commit-history", { commits: commitHistory[roomId]?.map(c => `${c.commitHash} - ${c.commitMessage}`) || [] });
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  socket.on("code-update", ({ roomId, code, language }) => {
    if (!roomCode[roomId]) roomCode[roomId] = {};
    roomCode[roomId][language] = code;
    saveData();
    io.to(roomId).emit("code-update", { code, language });
  });

  socket.on("send-message", ({ roomId, username, message }) => {
    if (!chatHistory[roomId]) chatHistory[roomId] = [];
    const chatMessage = { username, message };

    chatHistory[roomId].push(chatMessage);
    saveData();
    
    io.to(roomId).emit("receive-message", chatMessage);
  });

  socket.on("commit-code", ({ roomId, code, language, commitMessage }) => {
    if (!commitHistory[roomId]) commitHistory[roomId] = [];

    const timestamp = new Date().toISOString();
    const commitHash = `${timestamp}-${Math.random().toString(36).substr(2, 5)}`;
    const commitEntry = { commitHash, timestamp, commitMessage, language, code };

    commitHistory[roomId].push(commitEntry);
    saveData();

    io.to(roomId).emit("commit-history", { commits: commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`) });
  });

  socket.on("restore-code", ({ roomId, commitHash }) => {
    const commit = commitHistory[roomId]?.find(c => c.commitHash === commitHash);
    if (commit) {
      roomCode[roomId] = { ...roomCode[roomId], [commit.language]: commit.code };
      saveData();

      io.to(roomId).emit("code-update", { code: commit.code, language: commit.language });
      io.to(roomId).emit("language-update", { language: commit.language, code: commit.code });
    }
  });

  socket.on("generate-shareable-link", ({ code }) => {
    const shareId = Math.random().toString(36).substr(2, 9);
    sharedCode[shareId] = code;
    saveData();

    const shareUrl = `http://localhost:3000/codeeditor?shared=${shareId}`;
    io.to(socket.id).emit("shareable-link", { shareUrl });
  });

  socket.on("load-shared-code", ({ shareId }) => {
    const code = sharedCode[shareId];
    if (code) {
      io.to(socket.id).emit("shared-code-loaded", { code });
    } else {
      io.to(socket.id).emit("shared-code-error", { message: "Shared code not found!" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

console.log("Socket.io server running on port 5000");
