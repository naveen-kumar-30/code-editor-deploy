const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const DATA_FILE = path.join(__dirname, "data.json");

// Load or initialize data
let { rooms, hosts, typingUsers, roomCode, sharedCode } = loadData();
let chatHistory = {};
let commitHistory = {};
let lastCodeUpdate = {};
let pendingCodeUpdates = {};

function loadData() {
    try {
        return fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) : { rooms: {}, hosts: {}, typingUsers: {}, roomCode: {}, sharedCode: {} };
    } catch (error) {
        console.error("Error loading data:", error);
        return { rooms: {}, hosts: {}, typingUsers: {}, roomCode: {}, sharedCode: {} };
    }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ rooms, hosts, typingUsers, roomCode, commitHistory, sharedCode }, null, 2));
}

// Debounced save function (saves every 2 seconds to prevent performance issues)
const saveDataDebounced = debounce(saveData, 2000);

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

        if (!rooms[roomId].includes(username)) rooms[roomId].push(username);

        saveDataDebounced();

        io.to(socket.id).emit("sync-all-code", roomCode[roomId]);
        io.to(socket.id).emit("chat-history", chatHistory[roomId]);
        io.to(socket.id).emit("commit-history", { commits: commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`) });
        io.to(roomId).emit("user-list", rooms[roomId]);
        io.to(roomId).emit("server-owner", hosts[roomId]);
    });

    // Optimized Code Updates with Batch Processing
    socket.on("code-update", ({ roomId, code, language }) => {
        if (!roomCode[roomId]) roomCode[roomId] = {};
        
        pendingCodeUpdates[roomId] = pendingCodeUpdates[roomId] || {};
        pendingCodeUpdates[roomId][language] = code;

        throttleCodeUpdate(roomId, language);
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
            saveDataDebounced();
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
            saveDataDebounced();
            io.to(room).emit("user-list", rooms[room]);
        }
    });

    socket.on("commit-code", ({ roomId, code, language, commitMessage }) => {
        if (!commitHistory[roomId]) commitHistory[roomId] = [];

        const timestamp = new Date().toISOString();
        const commitHash = `${timestamp}-${Math.random().toString(36).substr(2, 5)}`;
        const commitEntry = { commitHash, timestamp, commitMessage, language, code };

        commitHistory[roomId].push(commitEntry);
        saveDataDebounced();

        io.to(roomId).emit("commit-history", { commits: commitHistory[roomId].map(c => `${c.commitHash} - ${c.commitMessage}`) });
    });

    socket.on("restore-code", ({ roomId, commitHash }) => {
        const commit = commitHistory[roomId]?.find(c => c.commitHash === commitHash);
        if (commit) {
            roomCode[roomId][commit.language] = commit.code;
            saveDataDebounced();

            io.to(roomId).emit("code-update", { code: commit.code, language: commit.language });
            io.to(roomId).emit("language-update", { language: commit.language, code: commit.code });
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Utility Functions

function throttleCodeUpdate(roomId, language) {
    const now = Date.now();
    if (!lastCodeUpdate[roomId]) lastCodeUpdate[roomId] = {};

    if (lastCodeUpdate[roomId][language] && now - lastCodeUpdate[roomId][language] < 200) {
        return;
    }

    lastCodeUpdate[roomId][language] = now;

    setTimeout(() => {
        if (pendingCodeUpdates[roomId]?.[language]) {
            roomCode[roomId][language] = pendingCodeUpdates[roomId][language];
            io.to(roomId).emit("code-update", { code: pendingCodeUpdates[roomId][language], language });
            delete pendingCodeUpdates[roomId][language];
            saveDataDebounced();
        }
    }, 100);
}

function debounce(func, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func(...args), delay);
    };
}
