require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const DATA_FILE = path.join(__dirname, "rooms.json");

// Helper function to load data
const loadRooms = () => {
  if (!fs.existsSync(DATA_FILE)) return {};
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
};

// Helper function to save data
const saveRooms = (data) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
};

// Socket.io Handling
io.on("connection", (socket) => {
  console.log("🔵 New user connected");

  socket.on("join-room", ({ roomId, username }) => {
    const rooms = loadRooms();

    if (!rooms[roomId]) {
      rooms[roomId] = {
        roomId,
        users: [username],
        host: username,
        typingUsers: [],
        roomCode: {},
        chatHistory: [],
        commitHistory: [],
        sharedCode: {},
      };
    } else if (!rooms[roomId].users.includes(username)) {
      rooms[roomId].users.push(username);
    }

    saveRooms(rooms);
    socket.join(roomId);

    io.to(socket.id).emit("sync-all-code", rooms[roomId].roomCode);
    io.to(socket.id).emit("chat-history", rooms[roomId].chatHistory);
    io.to(socket.id).emit("commit-history", {
      commits: rooms[roomId].commitHistory.map(c => `${c.commitHash} - ${c.commitMessage}`),
    });
    io.to(roomId).emit("user-list", rooms[roomId].users);
    io.to(roomId).emit("server-owner", rooms[roomId].host);
  });

  socket.on("code-update", ({ roomId, code, language }) => {
    const rooms = loadRooms();
    if (!rooms[roomId]) return;

    rooms[roomId].roomCode[language] = code;
    saveRooms(rooms);
    io.to(roomId).emit("code-update", { code, language });
  });

  socket.on("typing", ({ roomId, username }) => {
    const rooms = loadRooms();
    if (!rooms[roomId]) return;

    if (!rooms[roomId].typingUsers.includes(username)) {
      rooms[roomId].typingUsers.push(username);
    }

    saveRooms(rooms);
    io.to(roomId).emit("user-typing", rooms[roomId].typingUsers);
  });

  socket.on("stop-typing", ({ roomId, username }) => {
    const rooms = loadRooms();
    if (!rooms[roomId]) return;

    rooms[roomId].typingUsers = rooms[roomId].typingUsers.filter(user => user !== username);
    saveRooms(rooms);

    io.to(roomId).emit("user-typing", rooms[roomId].typingUsers);
  });

  socket.on("send-message", ({ roomId, username, message }) => {
    const rooms = loadRooms();
    if (!rooms[roomId]) return;

    const chatMessage = { username, message };
    rooms[roomId].chatHistory.push(chatMessage);
    saveRooms(rooms);

    io.to(roomId).emit("receive-message", chatMessage);
  });

  socket.on("leave-room", ({ roomId, username }) => {
    const rooms = loadRooms();
    if (!rooms[roomId]) return;

    rooms[roomId].users = rooms[roomId].users.filter(user => user !== username);
    if (rooms[roomId].host === username) {
      rooms[roomId].host = rooms[roomId].users.length > 0 ? rooms[roomId].users[0] : null;
    }

    saveRooms(rooms);
    io.to(roomId).emit("user-list", rooms[roomId].users);
    io.to(roomId).emit("server-owner", rooms[roomId].host);
  });

  socket.on("commit-code", ({ roomId, code, language, commitMessage }) => {
    const rooms = loadRooms();
    if (!rooms[roomId]) return;

    const timestamp = new Date().toISOString();
    const commitHash = `${timestamp}-${Math.random().toString(36).substr(2, 5)}`;

    const commitEntry = { commitHash, timestamp, commitMessage, language, code };
    rooms[roomId].commitHistory.push(commitEntry);
    saveRooms(rooms);

    io.to(roomId).emit("commit-history", {
      commits: rooms[roomId].commitHistory.map(c => `${c.commitHash} - ${c.commitMessage}`),
    });
  });

  socket.on("restore-code", ({ roomId, commitHash }) => {
    const rooms = loadRooms();
    if (!rooms[roomId]) return;

    const commit = rooms[roomId].commitHistory.find(c => c.commitHash === commitHash);
    if (commit) {
      rooms[roomId].roomCode[commit.language] = commit.code;
      saveRooms(rooms);

      io.to(roomId).emit("code-update", { code: commit.code, language: commit.language });
      io.to(roomId).emit("language-update", { language: commit.language, code: commit.code });
    }
  });

  socket.on("generate-shareable-link", ({ roomId, code }) => {
    const rooms = loadRooms();
    if (!rooms[roomId]) return;

    const shareId = Math.random().toString(36).substr(2, 9);
    rooms[roomId].sharedCode[shareId] = code;
    saveRooms(rooms);

    io.to(socket.id).emit("shareable-link", { shareUrl: `http://localhost:3000/codeeditor?shared=${shareId}` });
  });

  socket.on("load-shared-code", ({ shareId }) => {
    const rooms = loadRooms();
    const room = Object.values(rooms).find(r => r.sharedCode[shareId]);

    if (!room) {
      io.to(socket.id).emit("shared-code-error", { message: "Shared code not found!" });
      return;
    }

    io.to(socket.id).emit("shared-code-loaded", { code: room.sharedCode[shareId] });
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
