import { resolve } from 'path';

export const repoRoot = resolve(__dirname, '..', '..');
export const envFilePath = resolve(repoRoot, '.env');
export const publicRootPath = resolve(repoRoot, 'public');
