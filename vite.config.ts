import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // In local development, /api is forwarded to the standalone backend.
      proxy: {
        '/api': {
          target: env.DEV_API_PROXY_TARGET || 'http://localhost:3001',
          changeOrigin: false,
        },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
    },
  }
})
