const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const io = new Server(5000, { cors: { origin: "*" } });
const DATA_FILE = path.join(__dirname, "data.json");

let rooms = {}, hosts = {}, typingUsers = {}, roomCode = {}, chatHistory = {}, commitHistory = {}, sharedCode = {};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      ({ rooms, hosts, typingUsers, roomCode, commitHistory, sharedCode } = data);
    }
  } catch (error) {
    console.error("Error loading data:", error);
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ rooms, hosts, typingUsers, roomCode, commitHistory, sharedCode }, null, 2));
}

loadData();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);
    rooms[roomId] = rooms[roomId] || [];
    chatHistory[roomId] = chatHistory[roomId] || [];
    commitHistory[roomId] = commitHistory[roomId] || [];
    roomCode[roomId] = roomCode[roomId] || {};

    if (!rooms[roomId].includes(username)) {
      rooms[roomId].push(username);
    }
    if (!hosts[roomId]) hosts[roomId] = username;

    saveData();
    io.to(socket.id).emit("sync-all-code", roomCode[roomId]);
    io.to(socket.id).emit("chat-history", chatHistory[roomId]);
    io.to(socket.id).emit("commit-history", commitHistory[roomId]);
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  socket.on("code-update", ({ roomId, code, language }) => {
    roomCode[roomId] = { ...roomCode[roomId], [language]: code };
    saveData();
    io.to(roomId).emit("code-update", { code, language });
  });

  socket.on("typing", ({ roomId, username }) => {
    typingUsers[roomId] = typingUsers[roomId] || new Set();
    typingUsers[roomId].add(username);
    io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
  });

  socket.on("stop-typing", ({ roomId, username }) => {
    typingUsers[roomId]?.delete(username);
    io.to(roomId).emit("user-typing", Array.from(typingUsers[roomId]));
  });

  socket.on("send-message", ({ roomId, username, message }) => {
    const chatMessage = { username, message, timestamp: new Date().toISOString() };
    chatHistory[roomId].push(chatMessage);
    io.to(roomId).emit("receive-message", chatMessage);
  });

  socket.on("leave-room", ({ roomId, username }) => {
    if (rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter((user) => user !== username);
      if (hosts[roomId] === username) hosts[roomId] = rooms[roomId][0] || null;
      saveData();
      io.to(roomId).emit("user-list", rooms[roomId]);
      io.to(roomId).emit("server-owner", hosts[roomId]);
    }
  });

  socket.on("disconnect", () => {
    Object.keys(rooms).forEach((room) => {
      rooms[room] = rooms[room].filter((user) => user !== socket.id);
      if (hosts[room] === socket.id) hosts[room] = rooms[room][0] || null;
      saveData();
      io.to(room).emit("user-list", rooms[room]);
      io.to(room).emit("server-owner", hosts[room]);
    });
  });

  socket.on("commit-code", ({ roomId, code, language, commitMessage }) => {
    const commitHash = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    commitHistory[roomId].push({ commitHash, commitMessage, language, code });
    saveData();
    io.to(roomId).emit("commit-history", commitHistory[roomId]);
  });

  socket.on("restore-code", ({ roomId, commitHash }) => {
    const commit = commitHistory[roomId]?.find(c => c.commitHash === commitHash);
    if (commit) {
      roomCode[roomId][commit.language] = commit.code;
      saveData();
      io.to(roomId).emit("code-update", { code: commit.code, language: commit.language });
    }
  });

  socket.on("generate-shareable-link", ({ code }) => {
    const shareId = Math.random().toString(36).substr(2, 9);
    sharedCode[shareId] = code;
    saveData();
    io.to(socket.id).emit("shareable-link", { shareUrl: `http://localhost:3000/codeeditor?shared=${shareId}` });
  });

  socket.on("load-shared-code", ({ shareId }) => {
    io.to(socket.id).emit("shared-code-loaded", { code: sharedCode[shareId] || "" });
  });
});
