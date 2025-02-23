import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import LanguageSelectorNavbar from "../components/LanguageSelectorNavbar";
import CodeEditor from "../components/CodeEditor";

const socket = io("http://localhost:5000");

const CollaborativeEditor = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState("// Write your collaborative code here...");
  const [users, setUsers] = useState([]);
  const [language, setLanguage] = useState("javascript");
  const [theme, setTheme] = useState("vs-dark");
  const [isGitPopupOpen, setIsGitPopupOpen] = useState(false);
  const [commitHistory, setCommitHistory] = useState([]);
  const [selectedCommit, setSelectedCommit] = useState(null);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const username = sessionStorage.getItem("username");

  const chatBoxRef = useRef(null);

  useEffect(() => {
    if (!username) {
      navigate("/login", { replace: true });
      return;
    }

    socket.emit("join-room", { roomId, username });

    const handleUserList = (userList) => setUsers([...new Set(userList)]);
    const handleCodeUpdate = ({ code }) => setCode(code);
    const handleLanguageUpdate = ({ language, code }) => {
      setLanguage(language);
      setCode(code);
      toast.info(`Language changed to ${language}`);
    };
    const handleCommitHistory = ({ commits }) => setCommitHistory(commits);
    const handleSocketError = (error) => toast.error(`Socket Error: ${error.message}`);

    socket.on("user-list", handleUserList);
    socket.on("code-update", handleCodeUpdate);
    socket.on("language-update", handleLanguageUpdate);
    socket.on("commit-history", handleCommitHistory);
    socket.on("connect_error", handleSocketError);

    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", (event) => {
      if (!sessionStorage.getItem("username")) {
        navigate("/login", { replace: true });
      }
    });

    return () => {
      socket.emit("leave-room", { roomId, username });
      socket.off("user-list", handleUserList);
      socket.off("code-update", handleCodeUpdate);
      socket.off("language-update", handleLanguageUpdate);
      socket.off("commit-history", handleCommitHistory);
      socket.off("connect_error", handleSocketError);
    };
  }, [roomId, navigate, username]);

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    socket.emit("code-update", { roomId, code: newCode, language });
  };

  const handleLanguageChange = (newLanguage) => {
    socket.emit("language-update", { roomId, language: newLanguage });
  };

  const openGitPopup = () => {
    socket.emit("get-commit-history", { roomId });
    setIsGitPopupOpen(true);
  };

  const restoreCode = (commitHash) => {
    socket.emit("restore-code", { roomId, commitHash });
    toast.success("Code restored successfully!");
    setIsGitPopupOpen(false);
  };

  const commitChanges = () => {
    const commitMessage = prompt("Enter commit message:");
    if (!commitMessage) return;

    socket.emit("commit-code", { roomId, code, language, commitMessage });
    toast.success("Code committed successfully!");
  };

  const handleLogout = () => {
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("roomId");

    navigate("/editor", { replace: true });

    setTimeout(() => {
      window.history.pushState(null, "", window.location.href);
    }, 100);
  };

  const handleChatInput = (e) => {
    if (e.key === "Enter" && newMessage.trim()) {
      sendMessage(newMessage);
      setNewMessage("");
    }
  };

  const sendMessage = (message) => {
    socket.emit("send-message", { roomId, username, message });
  };

  useEffect(() => {
    const handleReceiveMessage = (chatMessage) => {
      setMessages((prevMessages) => [
        ...prevMessages,
        chatMessage,
      ]);
    };

    socket.on("receive-message", handleReceiveMessage);

    return () => {
      socket.off("receive-message", handleReceiveMessage);
    };
  }, []);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="h-screen flex flex-col bg-[#181a20]">
      <ToastContainer />
      <LanguageSelectorNavbar language={language} setLanguage={handleLanguageChange} theme={theme} users={users} />

      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="w-80 bg-[#252A34] text-white p-5 flex flex-col border-r border-gray-700 shadow-lg">
          <h2 className="text-lg font-bold mb-2">Room ID: {roomId}</h2>
          <h2 className="text-lg font-bold mb-4">Users ({users.length})</h2>
          <ul className="space-y-3">
            {users.map((user, index) => (
              <li key={index} className="bg-[#1E1F26] p-3 rounded-lg shadow-md border border-gray-700 flex justify-between">
                {user} {index === 0 && <span className="text-yellow-400"> (Host)</span>}
              </li>
            ))}
          </ul>

          {/* Chat Button */}
          <button
            onClick={() => setIsChatVisible(!isChatVisible)}
            className="mt-3 w-full bg-blue-500 px-5 py-2 rounded-lg text-white hover:bg-blue-700 transition-all font-semibold"
          >
            Chat
          </button>

          {/* Git Buttons */}
          <button
            onClick={openGitPopup}
            className="mt-6 w-full bg-yellow-500 px-5 py-2 rounded-lg text-white hover:bg-yellow-700 transition-all font-semibold"
          >
            View Git History
          </button>

          <button
            onClick={commitChanges}
            className="mt-3 w-full bg-green-500 px-5 py-2 rounded-lg text-white hover:bg-green-700 transition-all font-semibold"
          >
            Commit Changes
          </button>

          {/* Leave Room Button */}
          <button
            onClick={handleLogout}
            className="mt-3 w-full bg-red-500 px-5 py-2 rounded-lg text-white hover:bg-red-700 transition-all font-semibold"
          >
            Logout
          </button>
        </div>

        {/* Code Editor */}
        <div className="flex-1">
          <CodeEditor code={code} setCode={handleCodeChange} language={language} theme={theme} />
        </div>
      </div>

      {/* Chat Box */}
      {isChatVisible && (
        <div className="fixed bottom-0 right-0 w-96 bg-[#252A34] text-white p-5 rounded-tl-lg shadow-lg transition-all duration-300 ease-in-out h-[50%] max-h-[50%] overflow-y-auto flex flex-col">
          <div ref={chatBoxRef} className="flex-1 overflow-y-auto mb-3">
            {/* Chat messages */}
            {messages.map((chatMessage, index) => (
              <div
                key={index}
                className={`flex items-start ${chatMessage.username === username ? "flex-row-reverse" : ""} mb-3`}
              >
                {/* Avatar */}
                <div className="w-8 h-8 bg-gray-500 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm mr-3">
                  {chatMessage.username[0].toUpperCase()}
                </div>

                {/* Message Bubble */}
                <div className={`max-w-[70%] p-3 rounded-lg text-white ${chatMessage.username === username ? "bg-blue-500" : "bg-gray-700"}`}>
                  {/* Display the username */}
                  <div className="font-semibold">{chatMessage.username}</div>
                  {/* Display the message */}
                  <div className="text-sm">{chatMessage.message}</div>
                  {/* Display the timestamp */}
                  <div className="text-xs text-gray-400">{chatMessage.time}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Chat Input (Always at the bottom) */}
          <div className="flex items-center mt-auto border-t border-gray-600 pt-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1 p-3 bg-gray-800 text-white rounded-lg focus:outline-none"
              placeholder="Type a message..."
              onKeyDown={handleChatInput}
            />
            <button
              onClick={() => sendMessage(newMessage)}
              className="ml-3 bg-yellow-500 px-4 py-2 rounded-lg text-white hover:bg-yellow-700 transition-all"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Git History Popup */}
      {isGitPopupOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-[#252A34] p-5 rounded-lg shadow-lg w-1/2">
            <h2 className="text-lg text-white font-bold mb-3">Git Commit History</h2>

            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {commitHistory.map((commit, index) => (
                <li key={index} className="bg-gray-700 p-3 rounded-lg flex justify-between">
                  <span className="text-white">{commit}</span>
                  <button
                    onClick={() => setSelectedCommit(commit.split(" ")[0])}
                    className="bg-blue-500 px-2 py-1 rounded text-white hover:bg-blue-700"
                  >
                    View Code
                  </button>
                </li>
              ))}
            </ul>

            <button
              onClick={() => setIsGitPopupOpen(false)}
              className="mt-4 bg-red-500 px-4 py-2 rounded text-white hover:bg-red-700"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Full Code Viewer */}
      {selectedCommit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-[#252A34] p-5 rounded-lg shadow-lg w-3/4">
            <h2 className="text-lg text-white font-bold mb-3">Code from Commit: {selectedCommit}</h2>

            <pre className="bg-gray-800 p-3 rounded-lg text-white overflow-auto max-h-96">
              <code>// Full code from commit {selectedCommit} will be displayed here...</code>
            </pre>

            <div className="flex justify-between mt-4">
              <button
                onClick={() => restoreCode(selectedCommit)}
                className="bg-green-500 px-4 py-2 rounded text-white hover:bg-green-700"
              >
                Restore This Code
              </button>
              <button
                onClick={() => setSelectedCommit(null)}
                className="bg-gray-500 px-4 py-2 rounded text-white hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollaborativeEditor;
