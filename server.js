const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" }, pingInterval: 1000, pingTimeout: 5000 });

// **🔥 Optimized Memory-Only Storage for Speed**
let rooms = {};
let hosts = {};
let typingUsers = {};
let roomCode = {};
let chatHistory = {};
let commitHistory = {};
let sharedCode = {};

// **🔄 Optimized Real-Time Code Updates**
const codeUpdateTimers = {};
const debounceTime = 100; // Fast updates for live typing

io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
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
  });

  // **🚀 Frequent Code Updates for Real-Time Live Typing**
  socket.on("code-update", ({ roomId, code, language }) => {
    if (!roomCode[roomId]) roomCode[roomId] = {};
    roomCode[roomId][language] = code;

    // Minimize lag by reducing debounce time
    if (codeUpdateTimers[roomId]) clearTimeout(codeUpdateTimers[roomId]);

    codeUpdateTimers[roomId] = setTimeout(() => {
      io.to(roomId).emit("code-update", { code, language });
    }, debounceTime);
  });

  socket.on("language-update", ({ roomId, language }) => {
    const savedCode = roomCode[roomId]?.[language] || "// Start coding...";
    io.to(roomId).emit("language-update", { language, code: savedCode });
  });

  // **🔥 Fast Typing Indicator Updates**
  socket.on("typing", ({ roomId, username }) => {
    if (!typingUsers[roomId]) typingUsers[roomId] = new Set();
    typingUsers[roomId].add(username);
    io.to(roomId).emit("user-typing", [...typingUsers[roomId]]);
  });

  socket.on("stop-typing", ({ roomId, username }) => {
    typingUsers[roomId]?.delete(username);
    io.to(roomId).emit("user-typing", [...typingUsers[roomId]]);
  });

  // **📩 Fast Message Delivery for Chat**
  socket.on("send-message", ({ roomId, username, message }) => {
    if (!chatHistory[roomId]) chatHistory[roomId] = [];
    chatHistory[roomId].push({ username, message });
    io.to(roomId).emit("receive-message", { username, message });
  });

  // **🚀 Handle User Leaving Room**
  socket.on("leave-room", ({ roomId, username }) => {
    if (!rooms[roomId]) return;
    rooms[roomId] = rooms[roomId].filter(user => user !== username);
    if (hosts[roomId] === username) hosts[roomId] = rooms[roomId][0] || null;

    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  // **🛑 Handle Disconnection**
  socket.on("disconnect", () => {
    for (const room in rooms) {
      rooms[room] = rooms[room].filter(user => user !== socket.id);
      if (hosts[room] === socket.id) hosts[room] = rooms[room][0] || null;
    }
  });

  // **💾 Instant Commit History Updates**
  socket.on("commit-code", ({ roomId, code, language, commitMessage }) => {
    if (!commitHistory[roomId]) commitHistory[roomId] = [];

    const timestamp = new Date().toISOString();
    const commitHash = `${timestamp}-${Math.random().toString(36).substr(2, 5)}`;
    commitHistory[roomId].push({ commitHash, timestamp, commitMessage, language, code });

    io.to(roomId).emit("commit-history", commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`));
  });

  socket.on("get-commit-history", ({ roomId }) => {
    io.to(socket.id).emit("commit-history", commitHistory[roomId]?.map(c => `${c.commitHash} - ${c.commitMessage}`) || []);
  });

  // **🔄 Instant Code Restore**
  socket.on("restore-code", ({ roomId, commitHash }) => {
    const commit = commitHistory[roomId]?.find(c => c.commitHash === commitHash);
    if (!commit) return;

    roomCode[roomId] = { ...roomCode[roomId], [commit.language]: commit.code };

    io.to(roomId).emit("code-update", { code: commit.code, language: commit.language });
    io.to(roomId).emit("language-update", { language: commit.language, code: commit.code });
  });

  // **🔗 Fast Shareable Links**
  socket.on("generate-shareable-link", ({ code }) => {
    const shareId = Math.random().toString(36).substr(2, 9);
    sharedCode[shareId] = code;

    io.to(socket.id).emit("shareable-link", { shareUrl: `http://localhost:3000/codeeditor?shared=${shareId}` });
  });

  socket.on("load-shared-code", ({ shareId }) => {
    io.to(socket.id).emit(sharedCode[shareId] ? "shared-code-loaded" : "shared-code-error", sharedCode[shareId] ? { code: sharedCode[shareId] } : { message: "Shared code not found!" });
  });
});

// **🚀 Run the Server**
server.listen(PORT, () => console.log(`🔥 High-Performance Server Running on port ${PORT}`));
