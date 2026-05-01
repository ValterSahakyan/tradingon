const { spawn } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const repoRoot = path.resolve(__dirname, '..')
const isWin = process.platform === 'win32'
const backendHost = '127.0.0.1'
const backendPort = Number(process.env.PORT || 3000)
const databaseUrl = process.env.DATABASE_URL || 'postgresql://tradingon:tradingon@localhost:5434/tradingon'
const databaseStartupTimeoutMs = 60_000
const backendStartupTimeoutMs = 45_000
const backendStartupPollMs = 500

function resolveDatabaseEndpoint(connectionString) {
  try {
    const url = new URL(connectionString)
    return {
      host: url.hostname || '127.0.0.1',
      port: Number(url.port || 5432),
    }
  } catch {
    return {
      host: '127.0.0.1',
      port: 5434,
    }
  }
}

const databaseEndpoint = resolveDatabaseEndpoint(databaseUrl)

function createCommand(command) {
  return isWin
    ? {
        command: process.env.ComSpec || 'cmd.exe',
        args: ['/d', '/s', '/c', `npm run ${command}`],
      }
    : { command: 'npm', args: ['run', command] }
}

function startProcess(name, cwd, command, extraEnv = {}, options = {}) {
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

  child.once('exit', async (code, signal) => {
    const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`
    if (options.allowExistingPort) {
      const stillAvailable = await isPortOpen(options.allowExistingPort.host, options.allowExistingPort.port)
      if (stillAvailable) {
        console.warn(`[${name}] exited with ${detail}, but ${options.allowExistingPort.host}:${options.allowExistingPort.port} is already serving traffic; keeping other dev processes running`)
        return
      }
    }

    console.error(`[${name}] exited with ${detail}`)
    shutdown(code ?? 0)
  })

  return child
}

function runOneShot(name, cwd, command) {
  return new Promise((resolveRun, rejectRun) => {
    const childCommand = createCommand(command)
    const child = spawn(childCommand.command, childCommand.args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    })

    child.once('error', rejectRun)
    child.once('exit', (code) => {
      if ((code ?? 0) === 0) {
        resolveRun(undefined)
        return
      }

      rejectRun(new Error(`[${name}] exited with code ${code ?? 0}`))
    })
  })
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
  const databaseRunning = await isPortOpen(databaseEndpoint.host, databaseEndpoint.port)
  if (!databaseRunning) {
    await runOneShot('db', repoRoot, 'docker:db:up')
    await waitForPortOpen(databaseEndpoint.host, databaseEndpoint.port, databaseStartupTimeoutMs)
  }

  const backendRunning = await isPortOpen(backendHost, backendPort)
  if (backendRunning) {
    console.log(`[dev:all] backend already running on ${backendHost}:${backendPort}; reusing existing process`)
  } else {
    children.push(
      startProcess('backend', repoRoot, 'start:api:dev', {}, {
        allowExistingPort: { host: backendHost, port: backendPort },
      }),
    )
    await waitForPortOpen(backendHost, backendPort, backendStartupTimeoutMs)
  }

  children.push(
    startProcess('frontend', repoRoot, 'start:ui:dev', {
      SKIP_VITE_BACKEND_AUTOSTART: '1',
    }),
  )
}

main().catch((error) => {
  console.error('[dev:all] startup failed:', error.message)
  shutdown(1)
})
