import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

dotenv.config({ path: resolve(process.cwd(), '.env') })

const backendHost = '127.0.0.1'
const backendPort = Number(process.env.PORT || 3000)

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'public',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: `http://${backendHost}:${backendPort}`,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (_error, req, res) => {
            if (!('writeHead' in res) || res.headersSent) {
              return
            }

            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                error: 'Backend unavailable',
                path: req.url,
              }),
            )
          })
        },
      },
    },
  },
})
