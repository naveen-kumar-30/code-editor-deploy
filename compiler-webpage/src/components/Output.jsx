import React from "react";

const Output = ({ output }) => {
  return (
    <div className="mt-4 p-4 bg-gray-200 dark:bg-gray-800 dark:text-white rounded-md shadow-md">
      <h3 className="font-semibold text-lg">Output:</h3>
      <pre className="mt-2 whitespace-pre-wrap">{output}</pre>
    </div>
  );
};

export default Output;
