const { spawn } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const frontendRoot = path.join(repoRoot, 'frontend')
const isWin = process.platform === 'win32'
const backendHost = '127.0.0.1'
const backendPort = 3000
const backendStartupTimeoutMs = 45_000
const backendStartupPollMs = 500

function createCommand(command) {
  return isWin
    ? {
        command: process.env.ComSpec || 'cmd.exe',
        args: ['/d', '/s', '/c', `npm run ${command}`],
      }
    : { command: 'npm', args: ['run', command] }
}

function startProcess(name, cwd, command, extraEnv = {}) {
  const childCommand = createCommand(command)
  const child = spawn(childCommand.command, childCommand.args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: false,
  })

  child.once('error', (error) => {
    console.error(`[${name}] failed to start:`, error)
    shutdown(1)
  })

  child.once('exit', (code, signal) => {
    const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`
    console.error(`[${name}] exited with ${detail}`)
    shutdown(code ?? 0)
  })

  return child
}

let stopping = false
const children = []

function shutdown(exitCode = 0) {
  if (stopping) {
    return
  }

  stopping = true

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }

  setTimeout(() => process.exit(exitCode), 200)
}

process.once('SIGINT', () => shutdown(0))
process.once('SIGTERM', () => shutdown(0))

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

async function main() {
  children.push(startProcess('backend', repoRoot, 'start:dev'))
  await waitForPortOpen(backendHost, backendPort, backendStartupTimeoutMs)

  children.push(
    startProcess('frontend', frontendRoot, 'dev', {
      SKIP_VITE_BACKEND_AUTOSTART: '1',
    }),
  )
}

main().catch((error) => {
  console.error('[dev:all] startup failed:', error.message)
  shutdown(1)
})
