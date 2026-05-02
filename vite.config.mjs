import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

dotenv.config({ path: resolve(process.cwd(), '.env') })

const backendHost = '127.0.0.1'
const backendPort = Number(process.env.PORT || 3000)
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="18" fill="#052a24"/><path d="M35.2 12v5.28c5.58.74 9.2 4.36 9.2 9.2 0 1.1-.9 2-2 2s-2-.9-2-2c0-2.82-2.1-4.88-5.2-5.34v12.2l1.28.32c6.02 1.5 10.32 4.5 10.32 10.36 0 6.38-4.84 10.06-11.6 10.74V60h-4.4v-5.16c-6.34-.76-10.8-4.5-11.24-10.62-.08-1.12.78-2.08 1.9-2.16 1.12-.08 2.08.78 2.16 1.9.3 4.08 3.14 6.34 7.18 6.82V37.9l-1.12-.28c-5.88-1.48-10.1-4.24-10.1-9.98 0-6.06 4.7-9.7 11.22-10.36V12h4.4Zm-4.4 20.38V21.18c-3.92.54-6.82 2.56-6.82 5.98 0 2.94 2.02 4.24 6.82 5.22Zm4.4 5.94v12.54c4.42-.54 7.18-2.76 7.18-6.46 0-3.26-2.18-4.98-7.18-6.08Z" fill="#4ee3b8"/></svg>`

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'emit-favicon',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'favicon-v1.0.37.svg',
          source: faviconSvg,
        })
      },
    },
  ],
  publicDir: false,
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
