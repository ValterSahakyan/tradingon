import { spawn } from 'node:child_process'
import net from 'node:net'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

dotenv.config({ path: resolve(process.cwd(), '.env') })

const backendHost = '127.0.0.1'
const backendPort = Number(process.env.PORT || 3002)
const backendStartupTimeoutMs = 45_000
const backendStartupPollMs = 500

function isPortOpen(host, port) {
  return new Promise((resolvePort) => {
    const socket = new net.Socket()

    const finish = (open) => {
      socket.destroy()
      resolvePort(open)
    }

    socket.setTimeout(1000)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

async function waitForPortOpen(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await isPortOpen(host, port)) {
      return
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, backendStartupPollMs))
  }

  throw new Error(`Backend did not start on ${host}:${port} within ${timeoutMs}ms`)
}

function ensureBackendRunning() {
  let backendProcess = null
  let startupCheck = null

  return {
    name: 'ensure-backend-running',
    apply: 'serve',
    async configureServer(server) {
      if (process.env.SKIP_VITE_BACKEND_AUTOSTART === '1') {
        return
      }

      const stopBackend = () => {
        if (backendProcess && !backendProcess.killed) {
          backendProcess.kill()
        }
      }

      server.httpServer?.once('close', stopBackend)
      process.once('exit', stopBackend)
      process.once('SIGINT', stopBackend)
      process.once('SIGTERM', stopBackend)

      startupCheck ??= (async () => {
        const alreadyRunning = await isPortOpen(backendHost, backendPort)
        if (alreadyRunning) {
          return
        }

        const repoRoot = resolve(process.cwd())
        const backendCommand =
          process.platform === 'win32'
            ? {
                command: process.env.ComSpec ?? 'cmd.exe',
                args: ['/d', '/s', '/c', 'npm run start:api:dev'],
              }
            : {
                command: 'npm',
                args: ['run', 'start:api:dev'],
              }

        backendProcess = spawn(backendCommand.command, backendCommand.args, {
          cwd: repoRoot,
          stdio: 'inherit',
          shell: false,
        })

        backendProcess.once('exit', (code) => {
          if (code && code !== 0) {
            server.config.logger.error(`Backend process exited with code ${code}`)
          }
          backendProcess = null
        })

        backendProcess.once('error', (error) => {
          server.config.logger.error(`Backend process failed to start: ${error.message}`)
        })

        await waitForPortOpen(backendHost, backendPort, backendStartupTimeoutMs)
      })()

      await startupCheck
    },
  }
}

export default defineConfig({
  plugins: [react(), ensureBackendRunning()],
  build: {
    outDir: 'public',
    emptyOutDir: true,
  },
  server: {
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
