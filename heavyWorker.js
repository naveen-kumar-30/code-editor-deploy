const { parentPort } = require("worker_threads");

// **🖥️ Heavy CPU Computation (Matrix Multiplication)**
const performHeavyComputation = () => {
  const size = 500; // Increase size for more CPU usage
  let matrixA = Array.from({ length: size }, () => Array(size).fill(1));
  let matrixB = Array.from({ length: size }, () => Array(size).fill(1));
  let result = Array.from({ length: size }, () => Array(size).fill(0));

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      for (let k = 0; k < size; k++) {
        result[i][j] += matrixA[i][k] * matrixB[k][j];
      }
    }
  }
  return result;
};

parentPort.on("message", () => {
  performHeavyComputation();
  parentPort.postMessage("done");
});
