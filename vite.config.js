import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const { PORT = '3001' } = loadEnv(mode, process.cwd(), 'PORT');
  return {
    base: './',
    server: { proxy: { '/api': { target: 'http://127.0.0.1:' + PORT, changeOrigin: false } } },
    build: {
      rollupOptions: {
        input: { library: 'index.html', lecture: 'lecture.html' },
      },
    },
  };
});
