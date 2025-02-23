import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:5000");

const ChatBox = ({ roomId, username, isChatOpen, setIsChatOpen }) => {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");

  useEffect(() => {
    const handleNewMessage = (message) => {
      setMessages((prev) => [...prev, message]);
    };

    socket.on("receive-message", handleNewMessage);

    return () => {
      socket.off("receive-message", handleNewMessage);
    };
  }, []);

  const sendMessage = () => {
    if (!messageInput.trim()) return;
    const message = { user: username, text: messageInput };
    socket.emit("send-message", { roomId, message });
    setMessages((prev) => [...prev, message]);
    setMessageInput("");
  };

  return (
    <div
      className={`fixed right-0 top-0 h-full w-80 bg-[#252A34] text-white p-5 shadow-lg transition-transform ${
        isChatOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">Chat</h2>
        <button onClick={() => setIsChatOpen(false)} className="text-red-500 font-bold text-lg">
          ✖
        </button>
      </div>
      <div className="flex flex-col space-y-2 overflow-y-auto h-5/6 p-2 border border-gray-700 rounded-lg">
        {messages.length === 0 ? (
          <div className="text-gray-300">No messages yet...</div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`p-2 rounded-lg ${msg.user === username ? "bg-green-600 self-end" : "bg-gray-700"}`}>
              <strong>{msg.user}: </strong> {msg.text}
            </div>
          ))
        )}
      </div>
      <div className="mt-2 flex">
        <input
          type="text"
          placeholder="Type a message..."
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          className="w-full p-2 bg-gray-800 rounded-lg text-white"
        />
        <button onClick={sendMessage} className="ml-2 bg-green-500 px-4 py-2 rounded-lg text-white hover:bg-green-700">
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatBox;
