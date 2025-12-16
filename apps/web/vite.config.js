import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 3001,
    proxy: {
      "/api": "http://localhost:3000"
    }
  },
  preview: {
    port: 3001
  }
})
