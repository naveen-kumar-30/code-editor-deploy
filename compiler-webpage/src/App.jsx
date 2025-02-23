import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Editor from "./pages/Editor";
import Login from "./pages/login";
import CollaborativeEditor from "./pages/CollaborativeEditor"; // Import Collaborative Editor

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="/login" element={<Login />} />
        <Route path="/collaborative-editor/:roomId" element={<CollaborativeEditor />} />
      </Routes>
    </Router>
  );
};

export default App;
