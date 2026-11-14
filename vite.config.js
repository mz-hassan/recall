import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { library: 'index.html', lecture: 'lecture.html' },
    },
  },
});
