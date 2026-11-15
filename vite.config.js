import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // API_PORT (from .env or the shell) says where the shared API listens. It is deliberately not the
  // generic PORT, which tools often set to the web server's own port and would loop /api back to Vite.
  const { API_PORT = '3001' } = loadEnv(mode, process.cwd(), 'API_PORT');
  return {
    base: './',
    server: { proxy: { '/api': { target: 'http://127.0.0.1:' + API_PORT, changeOrigin: false } } },
    build: {
      rollupOptions: {
        input: { library: 'index.html', lecture: 'lecture.html', cs50: 'cs50.html' },
      },
    },
  };
});
