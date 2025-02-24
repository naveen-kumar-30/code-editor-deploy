const express = require("express");
const dotenv = require("dotenv");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
});

const DATA_FILE = path.join(__dirname, "data.json");

// Load initial data from JSON file
let userSocketMap = [];

const loadUserData = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, "utf8");
      userSocketMap = JSON.parse(data);
    }
  } catch (err) {
    console.error("Error loading data:", err);
  }
};

// Save data asynchronously
const saveUserData = () => {
  fs.writeFile(DATA_FILE, JSON.stringify(userSocketMap, null, 2), (err) => {
    if (err) console.error("Error saving data:", err);
  });
};

// Load user data at startup
loadUserData();

function getUsersInRoom(roomId) {
  return userSocketMap.filter((user) => user.roomId === roomId);
}

function getUserBySocketId(socketId) {
  return userSocketMap.find((user) => user.socketId === socketId) || null;
}

function getRoomId(socketId) {
  const user = getUserBySocketId(socketId);
  return user ? user.roomId : null;
}

// 🟢 **Real-Time Event Handling**
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("JOIN_REQUEST", ({ roomId, username }) => {
    const existingUser = getUsersInRoom(roomId).some((u) => u.username === username);
    if (existingUser) {
      io.to(socket.id).emit("USERNAME_EXISTS");
      return;
    }

    const user = {
      username,
      roomId,
      status: "ONLINE",
      cursorPosition: 0,
      typing: false,
      socketId: socket.id,
      currentFile: null,
    };

    userSocketMap.push(user);
    socket.join(roomId);
    saveUserData();

    socket.broadcast.to(roomId).emit("USER_JOINED", { user });
    io.to(socket.id).emit("JOIN_ACCEPTED", { user, users: getUsersInRoom(roomId) });
  });

  socket.on("TYPING_START", ({ cursorPosition }) => {
    const user = getUserBySocketId(socket.id);
    if (!user) return;

    user.cursorPosition = cursorPosition;
    user.typing = true;
    socket.broadcast.to(user.roomId).emit("TYPING_START", { user });
  });

  socket.on("TYPING_PAUSE", () => {
    const user = getUserBySocketId(socket.id);
    if (!user) return;

    user.typing = false;
    socket.broadcast.to(user.roomId).emit("TYPING_PAUSE", { user });
  });

  socket.on("FILE_UPDATED", ({ fileId, newContent }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;

    setTimeout(() => {
      socket.broadcast.to(roomId).emit("FILE_UPDATED", { fileId, newContent });
    }, 50);
  });

  socket.on("disconnecting", () => {
    const user = getUserBySocketId(socket.id);
    if (!user) return;

    const roomId = user.roomId;
    userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id);
    saveUserData();

    socket.broadcast.to(roomId).emit("USER_DISCONNECTED", { user });
  });

  socket.on("SEND_MESSAGE", ({ message }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit("RECEIVE_MESSAGE", { message });
  });

  socket.on("SYNC_DRAWING", ({ drawingData }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit("SYNC_DRAWING", { drawingData });
  });
});

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Real-time Collaborative Code Editor Backend is Running!");
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
