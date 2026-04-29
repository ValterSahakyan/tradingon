const { spawn } = require('node:child_process')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const frontendRoot = path.join(repoRoot, 'frontend')
const isWin = process.platform === 'win32'

function createCommand(command) {
  if (!isWin) {
    return { command: 'npm', args: ['run', command] }
  }

  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', `npm run ${command}`],
  }
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

function main() {
  children.push(startProcess('backend', repoRoot, 'start:dev'))

  children.push(
    startProcess('frontend', frontendRoot, 'dev', {
      SKIP_VITE_BACKEND_AUTOSTART: '1',
    }),
  )
}

try {
  main()
} catch (error) {
  console.error('[dev:all] startup failed:', error.message)
  shutdown(1)
}
