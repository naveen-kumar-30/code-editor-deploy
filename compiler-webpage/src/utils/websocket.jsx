let socket = null;

// ✅ Connect WebSocket
export const connectWebSocket = (url, onMessage) => {
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    socket = new WebSocket(url);

    socket.onopen = () => {
      console.log("✅ WebSocket Connected!");
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage(data); // Pass received data to callback function
    };

    socket.onclose = () => {
      console.log("❌ WebSocket Disconnected");
      socket = null; // Reset socket when closed
    };

    socket.onerror = (error) => {
      console.error("⚠️ WebSocket Error:", error);
    };
  }
  return socket;
};

// ✅ Send Message through WebSocket
export const sendMessage = (message) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else {
    console.warn("⚠️ Cannot send message: WebSocket is not open.");
  }
};

// ✅ Close WebSocket Connection
export const closeWebSocket = () => {
  if (socket) {
    socket.close();
    socket = null;
  }
};
