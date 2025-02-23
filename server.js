const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const { Worker } = require("worker_threads");

// Initialize Express app & Server
const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" }, pingInterval: 500, pingTimeout: 1000 });

const DATA_FILE = path.join(__dirname, "data.json");

// ✅ Load existing data or initialize empty
let { rooms, hosts, typingUsers, roomCode, sharedCode, commitHistory, chatHistory } = loadData();

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    console.error("Error loading data:", error);
  }
  return { rooms: {}, hosts: {}, typingUsers: {}, roomCode: {}, sharedCode: {}, commitHistory: {}, chatHistory: {} };
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ rooms, hosts, typingUsers, roomCode, commitHistory, sharedCode, chatHistory }, null, 2));
}

// ✅ Worker Thread for High-Performance Processing
const worker = new Worker(`
  const { parentPort } = require("worker_threads");
  let roomCode = new Map();

  parentPort.on("message", ({ roomId, code, language }) => {
    if (!roomCode.has(roomId)) roomCode.set(roomId, {});
    roomCode.get(roomId)[language] = code;
    parentPort.postMessage({ roomId, code, language });
  });
`, { eval: true });

worker.on("message", ({ roomId, code, language }) => {
  io.to(roomId).emit("code-update", { code, language });
});

io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = [];
      hosts[roomId] = username;
      roomCode[roomId] = {};
      chatHistory[roomId] = [];
      commitHistory[roomId] = [];
    }

    if (!rooms[roomId].includes(username)) rooms[roomId].push(username);
    saveData();

    io.to(socket.id).emit("sync-all-code", roomCode[roomId]);
    io.to(socket.id).emit("chat-history", chatHistory[roomId]);
    io.to(socket.id).emit("commit-history", commitHistory[roomId]);
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  // ✅ Optimized Conflict-Free Code Updates
  socket.on("code-update", ({ roomId, code, language }) => {
    worker.postMessage({ roomId, code, language });
  });

  socket.on("language-update", ({ roomId, language }) => {
    let savedCode = roomCode[roomId]?.[language] || "// Start coding...";
    io.to(roomId).emit("language-update", { language, code: savedCode });
  });

  // ✅ Fast Typing Indicator Handling
  socket.on("typing", ({ roomId, username }) => {
    if (!typingUsers[roomId]) typingUsers[roomId] = new Set();
    typingUsers[roomId].add(username);
    io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
  });

  socket.on("stop-typing", ({ roomId, username }) => {
    typingUsers[roomId]?.delete(username);
    io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
  });

  // ✅ Real-Time Chat Handling
  socket.on("send-message", ({ roomId, username, message }) => {
    if (!chatHistory[roomId]) chatHistory[roomId] = [];
    chatHistory[roomId].push({ username, message });

    io.to(roomId).emit("receive-message", { username, message });
  });

  socket.on("leave-room", ({ roomId, username }) => {
    if (!rooms[roomId]) return;

    rooms[roomId] = rooms[roomId].filter((user) => user !== username);
    if (hosts[roomId] === username) hosts[roomId] = rooms[roomId][0] || null;

    saveData();
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  socket.on("disconnect", () => {
    for (let room in rooms) {
      rooms[room] = rooms[room].filter((user) => user !== socket.id);
      if (hosts[room] === socket.id) hosts[room] = rooms[room][0] || null;
    }
    saveData();
  });

  // ✅ Code Version Control (Commit & Restore)
  socket.on("commit-code", ({ roomId, code, language, commitMessage }) => {
    if (!commitHistory[roomId]) commitHistory[roomId] = [];

    const timestamp = new Date().toISOString();
    const commitHash = `${timestamp}-${Math.random().toString(36).substr(2, 5)}`;

    commitHistory[roomId].push({ commitHash, timestamp, commitMessage, language, code });
    saveData();

    io.to(roomId).emit("commit-history", commitHistory[roomId]);
  });

  socket.on("get-commit-history", ({ roomId }) => {
    io.to(socket.id).emit("commit-history", commitHistory[roomId] || []);
  });

  socket.on("restore-code", ({ roomId, commitHash }) => {
    const commit = commitHistory[roomId]?.find((c) => c.commitHash === commitHash);
    if (!commit) return;

    roomCode[roomId][commit.language] = commit.code;
    saveData();

    io.to(roomId).emit("code-update", { code: commit.code, language: commit.language });
    io.to(roomId).emit("language-update", { language: commit.language, code: commit.code });
  });

  // ✅ Shareable Code Links
  socket.on("generate-shareable-link", ({ code }) => {
    const shareId = Math.random().toString(36).substr(2, 9);
    sharedCode[shareId] = code;
    saveData();

    io.to(socket.id).emit("shareable-link", { shareUrl: `http://localhost:3000/codeeditor?shared=${shareId}` });
  });

  socket.on("load-shared-code", ({ shareId }) => {
    const code = sharedCode[shareId];
    if (!code) return io.to(socket.id).emit("shared-code-error", { message: "Shared code not found!" });

    io.to(socket.id).emit("shared-code-loaded", { code });
  });
});

// ✅ Run High-Performance Server
server.listen(PORT, () => console.log(`🔥 Server running on port ${PORT}`));
