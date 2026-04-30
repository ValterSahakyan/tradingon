const childProcess = require('node:child_process')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const originalSpawn = childProcess.spawn
const esbuildCli = path.resolve(__dirname, '..', 'node_modules', 'esbuild', 'bin', 'esbuild')

function isEsbuildCommand(command) {
  if (!command) {
    return false
  }

  const normalized = String(command).toLowerCase()
  return normalized.endsWith('esbuild.exe') || normalized.endsWith(`${path.sep}esbuild`)
}

childProcess.spawn = function patchedSpawn(command, args = [], options = {}) {
  if (process.platform === 'win32' && isEsbuildCommand(command)) {
    return originalSpawn(process.execPath, [esbuildCli, ...args], options)
  }

  return originalSpawn(command, args, options)
}

const viteCli = path.resolve(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js')
void (async () => {
  await import(pathToFileURL(viteCli).href)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
