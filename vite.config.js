import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    // During `npm run dev`, browser calls to /api go to the local Fastify server.
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  build: {
    rollupOptions: {
      input: { library: 'index.html', lecture: 'lecture.html' },
    },
  },
});
