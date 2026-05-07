const { spawnSync } = require('node:child_process');

const args = ['jest', '--ci'];

if (process.platform === 'win32') {
  args.push('--runInBand');
} else {
  args.push('--maxWorkers=50%');
}

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: true,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
