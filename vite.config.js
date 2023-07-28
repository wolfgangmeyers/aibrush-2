import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    build: {
      outDir: 'build',
    },
    plugins: [react()],
    server: {
        port: 3001,
        host: "0.0.0.0",
        proxy: {
          "/api": "http://localhost:3000"
        }
    }
  };
});