const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const Y = require("yjs");
const WebSocket = require("ws");

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const DATA_FILE = path.join(__dirname, "data.json");

// Load existing data
let { rooms, hosts, typingUsers, roomCode, sharedCode } = loadData();
let chatHistory = {};
let commitHistory = {};

// Create Yjs Document for each room
const docs = new Map();

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (error) {
    console.error("Error loading data:", error);
  }
  return { rooms: {}, hosts: {}, typingUsers: {}, roomCode: {}, sharedCode: {} };
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ rooms, hosts, typingUsers, roomCode, commitHistory, sharedCode }, null, 2));
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = [];
      hosts[roomId] = username;
      roomCode[roomId] = {};
      chatHistory[roomId] = [];
      commitHistory[roomId] = [];
      docs.set(roomId, new Y.Doc()); // Create a new Yjs doc
    }

    if (!rooms[roomId].includes(username)) {
      rooms[roomId].push(username);
    }

    saveData();
    io.to(socket.id).emit("sync-all-code", roomCode[roomId]);
    io.to(socket.id).emit("chat-history", chatHistory[roomId]);
    io.to(socket.id).emit("commit-history", { commits: commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`) });
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);

    // Sync Yjs document on join
    if (docs.has(roomId)) {
      const doc = docs.get(roomId);
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      ws.on("open", () => ws.send(Y.encodeStateAsUpdate(doc)));
      ws.on("message", (update) => Y.applyUpdate(doc, update));
    }
  });

  socket.on("code-update", ({ roomId, code, language }) => {
    if (!roomCode[roomId]) roomCode[roomId] = {};
    roomCode[roomId][language] = code;
    saveData();

    // Broadcast update **efficiently** to avoid lag
    if (docs.has(roomId)) {
      const doc = docs.get(roomId);
      const yText = doc.getText(language);
      Y.applyUpdate(yText, Y.encodeStateAsUpdate(doc));
    }

    io.to(roomId).emit("code-update", { code, language });
  });

  socket.on("language-update", ({ roomId, language }) => {
    let savedCode = roomCode[roomId]?.[language] || "// Start coding...";
    io.to(roomId).emit("language-update", { language, code: savedCode });
  });

  socket.on("typing", ({ roomId, username }) => {
    if (!typingUsers[roomId]) typingUsers[roomId] = new Set();
    typingUsers[roomId].add(username);
    io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
  });

  socket.on("stop-typing", ({ roomId, username }) => {
    if (typingUsers[roomId]) {
      typingUsers[roomId].delete(username);
      io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
    }
  });

  socket.on("send-message", ({ roomId, username, message }) => {
    if (!chatHistory[roomId]) chatHistory[roomId] = [];
    const chatMessage = { username, message };

    chatHistory[roomId].push(chatMessage);
    io.to(roomId).emit("receive-message", chatMessage);
  });

  socket.on("leave-room", ({ roomId, username }) => {
    if (rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter((user) => user !== username);
      if (hosts[roomId] === username) {
        hosts[roomId] = rooms[roomId].length > 0 ? rooms[roomId][0] : null;
        io.to(roomId).emit("server-owner", hosts[roomId]);
      }
      saveData();
      io.to(roomId).emit("user-list", rooms[roomId]);
    }
  });

  socket.on("disconnect", () => {
    for (let room in rooms) {
      rooms[room] = rooms[room].filter((user) => user !== socket.id);
      if (hosts[room] === socket.id) {
        hosts[room] = rooms[room].length > 0 ? rooms[room][0] : null;
        io.to(room).emit("server-owner", hosts[room]);
      }
      saveData();
      io.to(room).emit("user-list", rooms[room]);
    }
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
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
