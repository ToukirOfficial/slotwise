// PM2 processes on the server. Each runs from the `current` release; all listen on 127.0.0.1 only.
// Ports come from the shared .env (WEB_PORT, API_PORT), set during the first deploy.
module.exports = {
  apps: [
    {
      name: 'slotwise-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --hostname 127.0.0.1',
      node_args: '--env-file=../../.env',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
    },
    {
      name: 'slotwise-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      node_args: '--env-file=../../.env',
      exec_mode: 'fork', // one process: the in-memory rate limiter relies on it (keep the API to a single process)
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
    },
    {
      name: 'slotwise-worker',
      cwd: './apps/api',
      script: 'dist/worker.js',
      node_args: '--env-file=../../.env',
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
    },
  ],
};
