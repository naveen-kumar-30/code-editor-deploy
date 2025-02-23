import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const Login = () => {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // Clear session storage if user is on the login page (ensuring proper logout behavior)
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("roomId");

    // Prevent back navigation to the collaborative editor
    const handlePopState = () => {
      navigate("/login", { replace: true });
    };

    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [navigate]);

  const generateRoomId = () => {
    if (!username.trim()) {
      toast.error("Please enter your name!");
      return;
    }

    const newRoomId = `room-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem("username", username);
    sessionStorage.setItem("roomId", newRoomId);

    toast.success(`New Room Created: ${newRoomId}`);
    navigate(`/collaborative-editor/${newRoomId}`);
  };

  const joinExistingRoom = () => {
    if (!username.trim()) {
      toast.error("Please enter your name!");
      return;
    }
    if (!roomId.trim()) {
      toast.error("Enter a Room ID to join!");
      return;
    }

    sessionStorage.setItem("username", username);
    sessionStorage.setItem("roomId", roomId);

    toast.success(`Joining Room: ${roomId}`);
    navigate(`/collaborative-editor/${roomId}`);
  };

  return (
    <div className="flex flex-col items-center mt-20">
      <ToastContainer />
      <h2 className="text-2xl">Login to Collaborative Editor</h2>
      <input
        type="text"
        placeholder="Enter your name"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="border p-2 mt-3"
      />
      <input
        type="text"
        placeholder="Enter Room ID (if joining an existing room)"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        className="border p-2 mt-3"
      />
      <div className="flex mt-4">
        <button onClick={generateRoomId} className="bg-blue-500 p-2 mr-2">
          Create Room
        </button>
        <button onClick={joinExistingRoom} className="bg-green-500 p-2">
          Join Room
        </button>
      </div>
    </div>
  );
};

export default Login;
