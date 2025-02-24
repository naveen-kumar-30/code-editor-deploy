const fs = require("fs");
const path = require("path");
const io = require("socket.io")(5000, {
  cors: { origin: "*" }
});

const DATA_FILE = path.join(__dirname, "data.json");

// Load existing data or initialize empty
let { rooms, hosts, typingUsers, roomCode, sharedCode, chatHistory, commitHistory } = loadData();

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return {
        rooms: data.rooms || {},
        hosts: data.hosts || {},
        typingUsers: data.typingUsers || {}, // Ensure it's an object
        roomCode: data.roomCode || {},
        sharedCode: data.sharedCode || {},
        chatHistory: data.chatHistory || {},
        commitHistory: data.commitHistory || {},
      };
    }
  } catch (error) {
    console.error("Error loading data:", error);
  }
  return { rooms: {}, hosts: {}, typingUsers: {}, roomCode: {}, sharedCode: {}, chatHistory: {}, commitHistory: {} };
}

function saveData() {
  try {
    // Convert typingUsers (Set) to an array
    const typingUsersConverted = Object.fromEntries(
      Object.entries(typingUsers).map(([room, users]) => [room, Array.from(users)])
    );

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        { rooms, hosts, typingUsers: typingUsersConverted, roomCode, chatHistory, commitHistory, sharedCode },
        null,
        2
      )
    );
  } catch (error) {
    console.error("Error saving data:", error);
  }
}

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
      typingUsers[roomId] = new Set();
    }

    if (!rooms[roomId].includes(username)) {
      rooms[roomId].push(username);
    }

    saveData();

    io.to(socket.id).emit("sync-all-code", roomCode[roomId]);
    io.to(socket.id).emit("chat-history", chatHistory[roomId]);
    io.to(socket.id).emit("commit-history", { 
      commits: commitHistory[roomId]?.map(c => `${c.commitHash} - ${c.commitMessage}`) || [] 
    });
    io.to(roomId).emit("user-list", rooms[roomId]);
    io.to(roomId).emit("server-owner", hosts[roomId]);
  });

  socket.on("code-update", ({ roomId, code, language }) => {
    if (!roomCode[roomId]) roomCode[roomId] = {};
    roomCode[roomId][language] = code;
    saveData();
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
    saveData();

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
      let userToRemove = null;

      for (let user of rooms[room]) {
        if (socket.id === user) {
          userToRemove = user;
          break;
        }
      }

      if (userToRemove) {
        rooms[room] = rooms[room].filter((user) => user !== userToRemove);

        if (hosts[room] === userToRemove) {
          hosts[room] = rooms[room].length > 0 ? rooms[room][0] : null;
          io.to(room).emit("server-owner", hosts[room]);
        }

        saveData();
        io.to(room).emit("user-list", rooms[room]);
      }
    }
  });

  socket.on("commit-code", ({ roomId, code, language, commitMessage }) => {
    if (!commitHistory[roomId]) commitHistory[roomId] = [];

    const timestamp = new Date().toISOString();
    const commitHash = `${timestamp}-${Math.random().toString(36).substr(2, 5)}`;
    const commitEntry = { commitHash, timestamp, commitMessage, language, code };

    commitHistory[roomId].push(commitEntry);
    saveData();

    io.to(roomId).emit("commit-history", { 
      commits: commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`) 
    });
  });

  socket.on("get-commit-history", ({ roomId }) => {
    io.to(socket.id).emit("commit-history", { 
      commits: commitHistory[roomId]?.map(c => `${c.commitHash} - ${c.commitMessage}`) || [] 
    });
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
});
