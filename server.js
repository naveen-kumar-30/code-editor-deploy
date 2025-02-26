const fs = require("fs");
const path = require("path");
const io = require("socket.io")(5000, { cors: { origin: "*" } });

const DATA_FILE = path.join(__dirname, "data.json");

// ✅ Load data efficiently with proper Set conversion
let { rooms, hosts, typingUsers, roomCode, sharedCode, chatHistory, commitHistory } = loadData();

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const rawData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      rawData.rooms = Object.fromEntries(
        Object.entries(rawData.rooms).map(([key, value]) => [key, new Set(value)])
      );
      return rawData;
    }
  } catch (error) {
    console.error("Error loading data:", error);
  }
  return { rooms: {}, hosts: {}, typingUsers: {}, roomCode: {}, sharedCode: {}, chatHistory: {}, commitHistory: {} };
}

// ✅ Save data, converting Sets to arrays before saving
const saveData = (() => {
  let lastSaved = 0;
  return () => {
    const now = Date.now();
    if (now - lastSaved > 1000) { // Throttle saves to once per second
      fs.writeFileSync(DATA_FILE, JSON.stringify({
        rooms: Object.fromEntries(Object.entries(rooms).map(([key, value]) => [key, [...value]])),
        hosts,
        typingUsers,
        roomCode,
        sharedCode,
        chatHistory,
        commitHistory
      }, null, 2));
      lastSaved = now;
    }
  };
})();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = new Set();
      hosts[roomId] = username;
      roomCode[roomId] = {};
      chatHistory[roomId] = [];
      commitHistory[roomId] = [];
    }

    rooms[roomId].add(username);
    saveData();

    socket.emit("sync-all-code", roomCode[roomId]);
    socket.emit("chat-history", chatHistory[roomId]);
    socket.emit("commit-history", commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`));
    io.to(roomId).emit("user-list", Array.from(rooms[roomId]));
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  let debounceTimer;
  socket.on("code-update", ({ roomId, code, language }) => {
    if (!roomCode[roomId]) roomCode[roomId] = {};
    roomCode[roomId][language] = code;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      saveData();
      io.to(roomId).emit("code-update", { code, language });
    }, 300); // Debounce updates for 300ms
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
    chatHistory[roomId].push({ username, message });
    saveData();
    io.to(roomId).emit("receive-message", { username, message });
  });

  socket.on("leave-room", ({ roomId, username }) => {
    if (rooms[roomId]) {
      rooms[roomId].delete(username);
      if (hosts[roomId] === username) {
        hosts[roomId] = rooms[roomId].size > 0 ? Array.from(rooms[roomId])[0] : null;
        io.to(roomId).emit("server-owner", hosts[roomId]);
      }
      saveData();
      io.to(roomId).emit("user-list", Array.from(rooms[roomId]));
    }
  });

  socket.on("disconnect", () => {
    for (let room in rooms) {
      rooms[room].delete(socket.id);
      if (hosts[room] === socket.id) {
        hosts[room] = rooms[room].size > 0 ? Array.from(rooms[room])[0] : null;
        io.to(room).emit("server-owner", hosts[room]);
      }
      saveData();
      io.to(room).emit("user-list", Array.from(rooms[room]));
    }
  });

  socket.on("commit-code", ({ roomId, code, language, commitMessage }) => {
    if (!commitHistory[roomId]) commitHistory[roomId] = [];

    const timestamp = new Date().toISOString();
    const commitHash = `${timestamp}-${Math.random().toString(36).substr(2, 5)}`;
    commitHistory[roomId].push({ commitHash, timestamp, commitMessage, language, code });

    saveData();
    io.to(roomId).emit("commit-history", commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`));
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
    socket.emit("shareable-link", { shareUrl: `http://localhost:3000/codeeditor?shared=${shareId}` });
  });

  socket.on("load-shared-code", ({ shareId }) => {
    if (sharedCode[shareId]) {
      socket.emit("shared-code-loaded", { code: sharedCode[shareId] });
    } else {
      socket.emit("shared-code-error", { message: "Shared code not found!" });
    }
  });
});
