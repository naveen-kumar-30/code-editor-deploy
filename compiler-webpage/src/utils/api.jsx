// api.js

export const runCode = async (code, language, stdin) => {
  try {
    const response = await fetch("http://localhost:2358/submissions?base64_encoded=true&wait=false", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_code: btoa(unescape(encodeURIComponent(code))), // Base64 encode the code
        language_id: language,
        stdin: btoa(unescape(encodeURIComponent(stdin))), // Base64 encode stdin
        base64_encoded: true,
        wait: false,
      }),
    });

    const data = await response.json();

    if (!data.token) {
      throw new Error("❌ Failed to get submission token!");
    }

    // Function to check the result
    const checkResult = async () => {
      const resultResponse = await fetch(
        `http://localhost:2358/submissions/${data.token}?base64_encoded=true`
      );
      const resultData = await resultResponse.json();

      if (resultData.status && resultData.status.id <= 2) {
        console.log("Code is still running, retrying...");
        setTimeout(checkResult, 1000);
      } else {
        if (resultData.status && resultData.status.id === 3) {
          return atob(resultData.stdout) || "⚠️ No output received.";
        } else {
          return atob(resultData.stderr) || "❌ Error running code.";
        }
      }
    };

    return await checkResult();
  } catch (error) {
    throw new Error(`Error running code: ${error.message}`);
  }
};

export const optimizeCode = async (code) => {
  const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY";
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: `Optimize this code:\n\n${code}` }],
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    return data.choices && data.choices.length > 0 ? data.choices[0].message.content.trim() : "⚠️ AI did not return any modifications.";
  } catch (error) {
    throw new Error(`AI Optimization failed: ${error.message}`);
  }
};
