import React, { useState } from "react";
import Navbar from "../Components/Navbar";
import CodeEditor from "../components/CodeEditor";

const JUDGE0_API_URL = "http://localhost:2358"; // Local Judge0 API

const Editor = () => {
  const [code, setCode] = useState("// Write your code here...");
  const [output, setOutput] = useState("");
  const [language, setLanguage] = useState(54); // Default language (C++)
  const [theme, setTheme] = useState("vs-dark");
  const [stdin, setStdin] = useState("");
  const [users, setUsers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false); // State for modal visibility

  const handleLanguageChange = (newLanguage) => {
    if (language !== newLanguage) {
      setLanguage(newLanguage);
      setCode("// Write your code here...");
      setOutput("");
      setStdin("");
    }
  };

  const handleRun = async () => {
    if (!code || !code.trim()) {
      alert("⚠️ Code cannot be empty!");
      return;
    }

    setOutput("⏳ Running... Please wait.");
    try {
      await runCode(code, language, stdin);  // Wait for code execution result
    } catch (error) {
      setOutput("❌ Error running code!");
      console.error(error);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false); // Close the modal
  };

  const isError = output && output.startsWith("❌");

  // Function to handle code execution
  const runCode = async (code, language, stdin) => {
    try {
      const response = await fetch(`${JUDGE0_API_URL}/submissions?base64_encoded=true&wait=true`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source_code: btoa(unescape(encodeURIComponent(code))), // Base64 encode the code
          language_id: language,
          stdin: btoa(unescape(encodeURIComponent(stdin))), // Base64 encode stdin
          base64_encoded: true,
          wait: true, // We will wait for the result here
        }),
      });

      const data = await response.json();

      if (!data.token) {
        throw new Error("❌ Failed to get submission token!");
      }

      // Check the result immediately (no polling)
      const resultResponse = await fetch(
        `${JUDGE0_API_URL}/submissions/${data.token}?base64_encoded=true`
      );
      const resultData = await resultResponse.json();

      let fullOutput = ""; // Initialize output variable
      const decodedOutput = resultData.stdout ? atob(resultData.stdout) : "";
      const decodedError = resultData.stderr ? atob(resultData.stderr) : "";
      const decodedCompileError = resultData.compile_output ? atob(resultData.compile_output) : "";

      // Display stdout or error
      if (decodedOutput) {
        fullOutput = decodedOutput || "⚠️ No output received.";
      }

      if (decodedCompileError) {
        fullOutput = `❌ Compilation Error:\n${decodedCompileError}`;
      } else if (decodedError) {
        fullOutput = `⚠️ Runtime Error:\n${decodedError}`;
      }

      setOutput(fullOutput); // Set output message
      setIsModalOpen(true); // Open the modal with the result

    } catch (error) {
      console.error("Error running code:", error);
      setOutput(`❌ Error running code: ${error.message}`);
      setIsModalOpen(true); // Open modal in case of error
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <Navbar
        language={language}
        setLanguage={handleLanguageChange}
        setTheme={setTheme}
        handleRun={handleRun}
        users={users}
      />

      <CodeEditor code={code} setCode={setCode} language={language} theme={theme} />

      <div className="p-4 bg-gray-800">
        <h3 className="text-lg font-bold text-yellow-400">Users:</h3>
        <ul className="text-yellow-400">
          {users.map((user, index) => (
            <li key={index}>{user}</li>
          ))}
        </ul>
      </div>

      <div className="p-4 bg-gray-800 fixed bottom-0 w-full">
        <h3 className="text-lg font-bold text-yellow-400">Input:</h3>
        <textarea
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          className="w-full p-3 bg-gray-900 rounded-lg text-yellow-400"
          rows="3"
          placeholder="Enter input for your program here..."
        />
      </div>

      {/* Output Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-1/3">
            <h2 className="text-xl font-bold text-yellow-400">Output:</h2>
            <pre className={`bg-gray-700 p-4 rounded-lg text-yellow-400 ${isError ? "border-l-4 border-red-500" : ""}`}>
              {output || "No output available."}
            </pre>
            <div className="mt-4 flex justify-end">
              <button
                onClick={closeModal}
                className="bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-400 transition-all duration-300"
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

export default Editor;
