import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";

const socket = io("http://localhost:5000");

const CommitHistoryPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [commits, setCommits] = useState([]);

  useEffect(() => {
    socket.emit("get-room-commits", { roomId });

    socket.on("room-commit-history", (data) => {
      setCommits(data.commits);
    });

    return () => {
      socket.off("room-commit-history");
    };
  }, [roomId]);

  const handleDeleteCommit = (commitHash) => {
    socket.emit("delete-commit", { roomId, commitHash });
  };

  const handleRestoreCommit = (commitHash) => {
    socket.emit("restore-code", { roomId, commitHash });
    navigate(`/codeeditor?room=${roomId}`);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h2 className="text-2xl font-bold mb-4">Commit History for Room: {roomId}</h2>
      {commits.length === 0 ? (
        <p>No commits found.</p>
      ) : (
        <div className="bg-white shadow-md p-4 rounded-lg">
          {commits.map((commit) => (
            <div key={commit.commitHash} className="border-b p-3 flex justify-between items-center">
              <div>
                <p className="font-bold">{commit.commitMessage}</p>
                <p className="text-sm text-gray-500">{commit.timestamp}</p>
              </div>
              <div>
                <button 
                  className="bg-green-500 text-white px-3 py-1 rounded-md mr-2"
                  onClick={() => handleRestoreCommit(commit.commitHash)}
                >
                  Restore
                </button>
                <button 
                  className="bg-red-500 text-white px-3 py-1 rounded-md"
                  onClick={() => handleDeleteCommit(commit.commitHash)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommitHistoryPage;
