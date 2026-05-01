import { resolve, sep } from 'path';

// dev (ts-node):  __dirname = /project/server/config       → up 2 = /project
// prod (compiled): __dirname = /app/server/dist/config     → up 3 = /app
const isCompiled = __dirname.includes(`${sep}dist${sep}`) || __dirname.endsWith(`${sep}dist`);
export const repoRoot = isCompiled
  ? resolve(__dirname, '..', '..', '..')
  : resolve(__dirname, '..', '..');
export const envFilePath = resolve(repoRoot, '.env');
export const publicRootPath = resolve(repoRoot, 'public');
