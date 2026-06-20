import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ttt/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      // Socket.io long-polling + WebSocket upgrade
      '/socket.io': {
        target:      'http://localhost:4000',
        changeOrigin: true,
        ws:           true,
      },
    },
  },
})
