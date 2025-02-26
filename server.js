const fs = require("fs");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const express = require("express");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" }
});

const DATA_FILE = path.join(__dirname, "data.json");

// Load existing data or initialize empty
let { rooms, hosts, typingUsers, roomCode, sharedCode } = loadData();
let chatHistory = {};  // Stores chat messages for each room
let commitHistory = {};  // Stores commit history for each room

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

// Serve static files if needed (e.g., frontend assets)
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("New user connected");

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
    io.to(socket.id).emit("chat-history", chatHistory[roomId]);
    io.to(socket.id).emit("commit-history", { commits: commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`) });
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  // Other event handlers as before...
  // (For brevity, I’m not repeating all the event handlers here but keeping them as per your original code)

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

// Dynamic port allocation
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
