module.exports = {
  apps: [
    {
      name: 'tradingon',
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      log_file: 'logs/combined.log',
      time: true,
      // Restart on crash with exponential backoff
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '30s',
    },
  ],
};
