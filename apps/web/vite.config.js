import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  server: {
    port: 3001,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },

  preview: {
    port: 3001,
  },

  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        courses: resolve(__dirname, './courses/index.html'),
      },
    },
  },
})
