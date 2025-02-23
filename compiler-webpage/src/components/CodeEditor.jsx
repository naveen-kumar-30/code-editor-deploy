import React, { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

const CodeEditor = ({ code, setCode, language, theme }) => {
  const editorContainerRef = useRef(null);
  const [editorHeight, setEditorHeight] = useState("100vh");

  // Function to dynamically calculate remaining height
  const updateEditorHeight = () => {
    if (editorContainerRef.current) {
      const topOffset = editorContainerRef.current.getBoundingClientRect().top;
      setEditorHeight(`${window.innerHeight - topOffset}px`);
    }
  };

  // Update height on mount & resize
  useEffect(() => {
    updateEditorHeight();
    window.addEventListener("resize", updateEditorHeight);
    return () => window.removeEventListener("resize", updateEditorHeight);
  }, []);

  // Function to get language name from ID
  const getLanguage = (id) => {
    const langMap = { 54: "cpp", 50: "c", 62: "java", 71: "python" };
    return langMap[id] || "javascript";
  };

  return (
    <div ref={editorContainerRef} className="flex-1" style={{ height: editorHeight }}>
      <Editor
        height={editorHeight}
        theme={theme}
        language={getLanguage(language)}
        value={code}
        onChange={(newValue) => setCode(newValue)}
        options={{
          fontSize: 16,
          minimap: { enabled: false },
          formatOnType: true,
          formatOnPaste: true,
          scrollbar: { vertical: "auto", horizontal: "auto" },
        }}
      />
    </div>
  );
};

export default CodeEditor;
