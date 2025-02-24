const express = require("express");
const dotenv = require("dotenv");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const compression = require("compression");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS || "*" }));
app.use(compression()); // Optimize response size

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.ALLOWED_ORIGINS || "*" },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
});

const DATA_FILE = path.join(__dirname, "data.json");
let userSocketMap = []; // Ensure it remains an array

// Load initial data from JSON file
const loadUserData = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, "utf8");
      const parsedData = JSON.parse(data);
      userSocketMap = Array.isArray(parsedData) ? parsedData : [];
    }
  } catch (err) {
    console.error("Error loading data:", err);
    userSocketMap = [];
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
    try {
      if (!roomId || !username) return;

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
    } catch (err) {
      console.error("Error in JOIN_REQUEST:", err);
    }
  });

  socket.on("TYPING_START", ({ cursorPosition }) => {
    try {
      const user = getUserBySocketId(socket.id);
      if (!user) return;

      user.cursorPosition = cursorPosition;
      user.typing = true;
      socket.broadcast.to(user.roomId).emit("TYPING_START", { user });
    } catch (err) {
      console.error("Error in TYPING_START:", err);
    }
  });

  socket.on("TYPING_PAUSE", () => {
    try {
      const user = getUserBySocketId(socket.id);
      if (!user) return;

      user.typing = false;
      socket.broadcast.to(user.roomId).emit("TYPING_PAUSE", { user });
    } catch (err) {
      console.error("Error in TYPING_PAUSE:", err);
    }
  });

  socket.on("FILE_UPDATED", ({ fileId, newContent }) => {
    try {
      const roomId = getRoomId(socket.id);
      if (!roomId || !fileId) return;

      setTimeout(() => {
        socket.broadcast.to(roomId).emit("FILE_UPDATED", { fileId, newContent });
      }, 50);
    } catch (err) {
      console.error("Error in FILE_UPDATED:", err);
    }
  });

  socket.on("disconnecting", () => {
    try {
      const user = getUserBySocketId(socket.id);
      if (!user) return;

      const roomId = user.roomId;
      userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id);
      saveUserData();

      if (roomId) {
        socket.broadcast.to(roomId).emit("USER_DISCONNECTED", { user });
      }
    } catch (err) {
      console.error("Error in disconnecting:", err);
    }
  });

  socket.on("SEND_MESSAGE", ({ message }) => {
    try {
      const roomId = getRoomId(socket.id);
      if (!roomId || !message) return;

      socket.broadcast.to(roomId).emit("RECEIVE_MESSAGE", { message });
    } catch (err) {
      console.error("Error in SEND_MESSAGE:", err);
    }
  });

  socket.on("SYNC_DRAWING", ({ drawingData }) => {
    try {
      const roomId = getRoomId(socket.id);
      if (!roomId || !drawingData) return;

      socket.broadcast.to(roomId).emit("SYNC_DRAWING", { drawingData });
    } catch (err) {
      console.error("Error in SYNC_DRAWING:", err);
    }
  });
});

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Real-time Collaborative Code Editor Backend is Running!");
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Handle graceful shutdown
const shutdownServer = () => {
  console.log("Shutting down server...");
  saveUserData();
  process.exit();
};

process.on("SIGINT", shutdownServer);
process.on("SIGTERM", shutdownServer);
