const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const { debounce } = require("lodash"); // Ensure lodash is installed

// Initialize the express app
const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const DATA_FILE = path.join(__dirname, "data.json");

// Load existing data or initialize empty objects
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return {
        rooms: data.rooms || {},
        hosts: data.hosts || {},
        typingUsers: data.typingUsers || {},
        roomCode: data.roomCode || {},
        commitHistory: data.commitHistory || {},
        sharedCode: data.sharedCode || {}, // Ensures sharedCode exists
      };
    }
  } catch (error) {
    console.error("Error loading data:", error);
  }
  return { rooms: {}, hosts: {}, typingUsers: {}, roomCode: {}, commitHistory: {}, sharedCode: {} };
}

// Initialize server data
let { rooms, hosts, typingUsers, roomCode, sharedCode, commitHistory } = loadData();

// Ensure sharedCode is always defined
if (!sharedCode) sharedCode = {};

// Save data to file
function saveData() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({ rooms, hosts, typingUsers, roomCode, commitHistory, sharedCode }, null, 2)
  );
}

io.on("connection", (socket) => {
  console.log("New user connected");

  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = [];
      hosts[roomId] = username;
      roomCode[roomId] = {};
      commitHistory[roomId] = [];
      sharedCode[roomId] = {}; // Ensuring sharedCode is initialized
    }

    if (!rooms[roomId].includes(username)) {
      rooms[roomId].push(username);
    }

    saveData();

    io.to(socket.id).emit("sync-all-code", roomCode[roomId]);
    io.to(socket.id).emit(
      "commit-history",
      commitHistory[roomId].map((c) => `${c.commitHash} - ${c.commitMessage}`)
    );
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  const debouncedTypingStart = debounce(({ roomId, username }) => {
    if (!typingUsers[roomId]) typingUsers[roomId] = new Set();
    typingUsers[roomId].add(username);
    io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
  }, 300);

  socket.on("typing", ({ roomId, username }) => {
    debouncedTypingStart({ roomId, username });
  });

  socket.on("stop-typing", ({ roomId, username }) => {
    if (typingUsers[roomId]) {
      typingUsers[roomId].delete(username);
      io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
    }
  });

  socket.on("code-update", ({ roomId, code, language }) => {
    if (!roomCode[roomId]) roomCode[roomId] = {};
    roomCode[roomId][language] = code;
    saveData();
    io.to(roomId).emit("code-update", { code, language });
  });

  socket.on("commit-code", ({ roomId, code, language, commitMessage }) => {
    if (!commitHistory[roomId]) commitHistory[roomId] = [];

    const timestamp = new Date().toISOString();
    const commitHash = `${timestamp}-${Math.random().toString(36).substr(2, 5)}`;
    const commitEntry = { commitHash, timestamp, commitMessage, language, code };

    commitHistory[roomId].push(commitEntry);
    saveData();

    io.to(roomId).emit("commit-history", {
      commits: commitHistory[roomId].map((c) => `${c.commitHash} - ${c.commitMessage}`),
    });
  });

  socket.on("restore-code", ({ roomId, commitHash }) => {
    const commit = commitHistory[roomId]?.find((c) => c.commitHash === commitHash);
    if (commit) {
      roomCode[roomId] = { ...roomCode[roomId], [commit.language]: commit.code };
      saveData();

      io.to(roomId).emit("code-update", { code: commit.code, language: commit.language });
      io.to(roomId).emit("language-update", { language: commit.language, code: commit.code });
    }
  });

  socket.on("send-message", ({ roomId, username, message }) => {
    if (!sharedCode[roomId]) sharedCode[roomId] = []; // Ensure chat history exists
    const chatMessage = { username, message };

    sharedCode[roomId].push(chatMessage);
    io.to(roomId).emit("receive-message", chatMessage);
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
});

// Start server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
