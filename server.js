const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { Worker } = require("worker_threads");

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" }, pingInterval: 500, pingTimeout: 1000 });

// **🔥 Optimized Real-Time Storage**
let rooms = new Map();
let hosts = new Map();
let typingUsers = new Map();
let roomCode = new Map();
let chatHistory = new Map();
let commitHistory = new Map();
let sharedCode = new Map();

// **🚀 Worker Thread for Heavy CPU Processing (Prevents Blocking)**
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
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
      hosts.set(roomId, username);
      roomCode.set(roomId, {});
      chatHistory.set(roomId, []);
      commitHistory.set(roomId, []);
    }

    rooms.get(roomId).add(username);

    io.to(socket.id).emit("sync-all-code", roomCode.get(roomId));
    io.to(socket.id).emit("chat-history", chatHistory.get(roomId));
    io.to(socket.id).emit("commit-history", commitHistory.get(roomId));
    io.to(roomId).emit("user-list", Array.from(rooms.get(roomId)));
    io.to(roomId).emit("server-owner", hosts.get(roomId));
  });

  // **🚀 Instant Code Updates with Conflict-Free Handling**
  socket.on("code-update", ({ roomId, code, language }) => {
    worker.postMessage({ roomId, code, language });
  });

  socket.on("language-update", ({ roomId, language }) => {
    const savedCode = roomCode.get(roomId)?.[language] || "// Start coding...";
    io.to(roomId).emit("language-update", { language, code: savedCode });
  });

  // **🔥 Fast Typing Indicator Updates**
  socket.on("typing", ({ roomId, username }) => {
    if (!typingUsers.has(roomId)) typingUsers.set(roomId, new Set());
    typingUsers.get(roomId).add(username);
    io.to(roomId).emit("user-typing", Array.from(typingUsers.get(roomId)));
  });

  socket.on("stop-typing", ({ roomId, username }) => {
    typingUsers.get(roomId)?.delete(username);
    io.to(roomId).emit("user-typing", Array.from(typingUsers.get(roomId)));
  });

  // **📩 Real-Time Chat Without Lag**
  socket.on("send-message", ({ roomId, username, message }) => {
    if (!chatHistory.has(roomId)) chatHistory.set(roomId, []);
    chatHistory.get(roomId).push({ username, message });
    io.to(roomId).emit("receive-message", { username, message });
  });

  // **🚀 Handle User Leaving Room**
  socket.on("leave-room", ({ roomId, username }) => {
    if (!rooms.has(roomId)) return;
    rooms.get(roomId).delete(username);
    if (hosts.get(roomId) === username) hosts.set(roomId, Array.from(rooms.get(roomId))[0] || null);

    io.to(roomId).emit("user-list", Array.from(rooms.get(roomId)));
    io.to(roomId).emit("server-owner", hosts.get(roomId));
  });

  // **🛑 Handle Disconnection**
  socket.on("disconnect", () => {
    rooms.forEach((users, room) => {
      users.delete(socket.id);
      if (hosts.get(room) === socket.id) hosts.set(room, Array.from(users)[0] || null);
    });
  });

  // **💾 Instant Commit History Updates**
  socket.on("commit-code", ({ roomId, code, language, commitMessage }) => {
    if (!commitHistory.has(roomId)) commitHistory.set(roomId, []);

    const timestamp = new Date().toISOString();
    const commitHash = `${timestamp}-${Math.random().toString(36).substr(2, 5)}`;
    commitHistory.get(roomId).push({ commitHash, timestamp, commitMessage, language, code });

    io.to(roomId).emit("commit-history", commitHistory.get(roomId));
  });

  socket.on("get-commit-history", ({ roomId }) => {
    io.to(socket.id).emit("commit-history", commitHistory.get(roomId) || []);
  });

  // **🔄 Instant Code Restore**
  socket.on("restore-code", ({ roomId, commitHash }) => {
    const commit = commitHistory.get(roomId)?.find(c => c.commitHash === commitHash);
    if (!commit) return;

    roomCode.get(roomId)[commit.language] = commit.code;

    io.to(roomId).emit("code-update", { code: commit.code, language: commit.language });
    io.to(roomId).emit("language-update", { language: commit.language, code: commit.code });
  });

  // **🔗 Fast Shareable Links**
  socket.on("generate-shareable-link", ({ code }) => {
    const shareId = Math.random().toString(36).substr(2, 9);
    sharedCode.set(shareId, code);

    io.to(socket.id).emit("shareable-link", { shareUrl: `http://localhost:3000/codeeditor?shared=${shareId}` });
  });

  socket.on("load-shared-code", ({ shareId }) => {
    io.to(socket.id).emit(sharedCode.has(shareId) ? "shared-code-loaded" : "shared-code-error", sharedCode.get(shareId) ? { code: sharedCode.get(shareId) } : { message: "Shared code not found!" });
  });
});

// **🚀 Run the High-Performance Server**
server.listen(PORT, () => console.log(`🔥 High-Performance Server Running on port ${PORT}`));
