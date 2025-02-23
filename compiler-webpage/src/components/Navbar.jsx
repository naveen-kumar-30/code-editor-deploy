import React from "react";
import { useNavigate } from "react-router-dom"; // Import useNavigate for routing

const languages = [
  { id: 54, name: "C++" },
  { id: 50, name: "C" },
  { id: 62, name: "Java" },
  { id: 71, name: "Python" },
  { id: 63, name: "JavaScript" },
  { id: 51, name: "C# (C-Sharp)" },
  { id: 60, name: "Go" },
  { id: 64, name: "Lua" },
  { id: 74, name: "TypeScript" },
  { id: 68, name: "PHP" },
  { id: 69, name: "Ruby" },
  { id: 70, name: "Swift" },
  { id: 73, name: "Kotlin" },
  { id: 81, name: "Rust" },
  { id: 78, name: "R" },
  { id: 79, name: "Scala" },
  { id: 72, name: "Perl" },
  { id: 80, name: "Dart" },
  { id: 65, name: "Pascal" },
  { id: 55, name: "Fortran" },
  { id: 77, name: "Bash" },
];

const themes = ["vs-dark", "light"];

const Navbar = ({ setLanguage, setTheme, handleRun, editorContent, setCode }) => {
  const navigate = useNavigate(); // React Router Hook for navigation

  const handleDownload = () => {
    const blob = new Blob([editorContent], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "code.txt";
    link.click();
  };

  const handleLocalStorage = () => {
    localStorage.setItem("savedCode", editorContent);
    alert("✅ Code saved to localStorage!");
  };

  const handleAI = async () => {
    if (!editorContent.trim()) {
      alert("⚠️ No code to analyze!");
      return;
    }

    try {
      const response = await fetch("http://localhost:5000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: editorContent }),
      });

      const data = await response.json();
      if (data.suggested_code) {
        setCode(data.suggested_code);
      } else {
        alert("⚠️ AI did not return a valid response.");
      }
    } catch (error) {
      console.error("AI Processing Error:", error);
      alert("❌ Error processing AI request.");
    }
  };

  // 🆕 Function to navigate to the login page
  const handleNavigateToLogin = () => {
    navigate("/login"); // Redirects to the login page
  };

  return (
    <nav className="flex justify-between items-center bg-gray-900/90 p-4 shadow-2xl rounded-xl mx-6 mt-4 border border-gray-600/50 backdrop-blur-md transition-all duration-300">
      {/* 🚀 Logo / Brand */}
      <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
        Nexus Code
      </h1>

      {/* 🌍 Language & Theme Selectors */}
      <div className="flex gap-4">
        <select
          onChange={(e) => setLanguage(Number(e.target.value))}
          className="p-2 bg-gray-800 text-white border border-gray-500 rounded-lg cursor-pointer transition-all duration-300 hover:scale-105 focus:border-blue-400 outline-none"
        >
          {languages.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.name}
            </option>
          ))}
        </select>

        <select
          onChange={(e) => setTheme(e.target.value)}
          className="p-2 bg-gray-800 text-white border border-gray-500 rounded-lg cursor-pointer transition-all duration-300 hover:scale-105 focus:border-purple-400 outline-none"
        >
          {themes.map((theme) => (
            <option key={theme} value={theme}>
              {theme}
            </option>
          ))}
        </select>
      </div>

      {/* 🎨 Buttons */}
      <div className="flex gap-4">
        <button
          onClick={handleRun}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-bold bg-blue-500 shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-blue-500/50"
        >
          🚀
        </button>

        <button
          onClick={handleDownload}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-bold bg-green-500 shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-green-500/50"
        >
          💾
        </button>

        <button
          onClick={handleAI}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-bold bg-yellow-500 shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-yellow-500/50"
        >
          🤖
        </button>

        <button
          onClick={handleLocalStorage}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-bold bg-red-500 shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-red-500/50"
        >
          ⬇️
        </button>

        {/* 🆕 New Button for Login / Room Creation */}
        <button
          onClick={handleNavigateToLogin}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-bold bg-purple-500 shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-purple-500/50"
        >
          🔑
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
