import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    include: ["@monaco-editor/react"],
    exclude: ["monaco-editor"]
  }
});
