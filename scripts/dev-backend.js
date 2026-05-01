const path = require('node:path')
const tsConfigPath = path.resolve(__dirname, '..', 'server', 'tsconfig.json')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })
require('ts-node').register({
  project: tsConfigPath,
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
  },
})
require('tsconfig-paths').register({
  baseUrl: path.resolve(__dirname, '..', 'server'),
  paths: {
    '@/*': ['./*'],
  },
})

require(path.resolve(__dirname, '..', 'server', 'main.ts'))
