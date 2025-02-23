const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const DATA_FILE = path.join(__dirname, "data.json");

// Load Data Asynchronously on Startup
const loadData = async () => {
  try {
    const data = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(data);
  } catch {
    return {}; // Return empty object if file doesn't exist
  }
};

// **🌟 Batched Data Saving (Every 5 seconds)**
let savePending = false;
const saveData = async () => {
  if (savePending) return;
  savePending = true;
  setTimeout(async () => {
    try {
      await fs.writeFile(DATA_FILE, JSON.stringify({ rooms, hosts, typingUsers, roomCode, commitHistory, sharedCode }, null, 2));
    } catch (error) {
      console.error("Error saving data:", error);
    }
    savePending = false;
  }, 5000); // Save every 5 seconds instead of every event
};

// **🚀 Optimized In-Memory Data Storage**
let rooms = {};
let hosts = {};
let typingUsers = {};
let roomCode = {};
let chatHistory = {};
let commitHistory = {};
let sharedCode = {};

// **🔄 Load Data into Memory at Startup**
(async () => {
  const data = await loadData();
  rooms = data.rooms || {};
  hosts = data.hosts || {};
  typingUsers = data.typingUsers || {};
  roomCode = data.roomCode || {};
  commitHistory = data.commitHistory || {};
  sharedCode = data.sharedCode || {};
})();

io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  socket.on("join-room", async ({ roomId, username }) => {
    socket.join(roomId);

    rooms[roomId] = rooms[roomId] || [];
    hosts[roomId] = hosts[roomId] || username;
    roomCode[roomId] = roomCode[roomId] || {};
    chatHistory[roomId] = chatHistory[roomId] || [];
    commitHistory[roomId] = commitHistory[roomId] || [];

    if (!rooms[roomId].includes(username)) rooms[roomId].push(username);

    await saveData();

    io.to(socket.id).emit("sync-all-code", roomCode[roomId]);
    io.to(socket.id).emit("chat-history", chatHistory[roomId]);
    io.to(socket.id).emit("commit-history", commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`));
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  // **✅ Optimized Code Update with Debounce**
  const codeUpdateTimers = {};
  socket.on("code-update", ({ roomId, code, language }) => {
    if (!roomCode[roomId]) roomCode[roomId] = {};

    if (codeUpdateTimers[roomId]) clearTimeout(codeUpdateTimers[roomId]);

    codeUpdateTimers[roomId] = setTimeout(async () => {
      roomCode[roomId][language] = code;
      await saveData();
      io.to(roomId).emit("code-update", { code, language });
    }, 500);
  });

  socket.on("language-update", ({ roomId, language }) => {
    const savedCode = roomCode[roomId]?.[language] || "// Start coding...";
    io.to(roomId).emit("language-update", { language, code: savedCode });
  });

  // **🔥 Optimized Typing Indicator using Set**
  socket.on("typing", ({ roomId, username }) => {
    if (!typingUsers[roomId]) typingUsers[roomId] = new Set();
    typingUsers[roomId].add(username);
    io.to(roomId).emit("user-typing", [...typingUsers[roomId]]);
  });

  socket.on("stop-typing", ({ roomId, username }) => {
    typingUsers[roomId]?.delete(username);
    io.to(roomId).emit("user-typing", [...typingUsers[roomId]]);
  });

  socket.on("send-message", ({ roomId, username, message }) => {
    if (!chatHistory[roomId]) chatHistory[roomId] = [];
    chatHistory[roomId].push({ username, message });
    io.to(roomId).emit("receive-message", { username, message });
  });

  socket.on("leave-room", async ({ roomId, username }) => {
    if (!rooms[roomId]) return;
    rooms[roomId] = rooms[roomId].filter(user => user !== username);
    if (hosts[roomId] === username) hosts[roomId] = rooms[roomId][0] || null;

    await saveData();
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  socket.on("disconnect", async () => {
    for (const room in rooms) {
      rooms[room] = rooms[room].filter(user => user !== socket.id);
      if (hosts[room] === socket.id) hosts[room] = rooms[room][0] || null;
    }
    await saveData();
  });

  socket.on("commit-code", async ({ roomId, code, language, commitMessage }) => {
    if (!commitHistory[roomId]) commitHistory[roomId] = [];

    const timestamp = new Date().toISOString();
    const commitHash = `${timestamp}-${Math.random().toString(36).substr(2, 5)}`;
    commitHistory[roomId].push({ commitHash, timestamp, commitMessage, language, code });

    await saveData();
    io.to(roomId).emit("commit-history", commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`));
  });

  socket.on("get-commit-history", ({ roomId }) => {
    io.to(socket.id).emit("commit-history", commitHistory[roomId]?.map(c => `${c.commitHash} - ${c.commitMessage}`) || []);
  });

  socket.on("restore-code", async ({ roomId, commitHash }) => {
    const commit = commitHistory[roomId]?.find(c => c.commitHash === commitHash);
    if (!commit) return;

    roomCode[roomId] = { ...roomCode[roomId], [commit.language]: commit.code };
    await saveData();

    io.to(roomId).emit("code-update", { code: commit.code, language: commit.language });
    io.to(roomId).emit("language-update", { language: commit.language, code: commit.code });
  });

  socket.on("generate-shareable-link", async ({ code }) => {
    const shareId = Math.random().toString(36).substr(2, 9);
    sharedCode[shareId] = code;
    await saveData();

    io.to(socket.id).emit("shareable-link", { shareUrl: `http://localhost:3000/codeeditor?shared=${shareId}` });
  });

  socket.on("load-shared-code", ({ shareId }) => {
    io.to(socket.id).emit(sharedCode[shareId] ? "shared-code-loaded" : "shared-code-error", sharedCode[shareId] ? { code: sharedCode[shareId] } : { message: "Shared code not found!" });
  });
});

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
