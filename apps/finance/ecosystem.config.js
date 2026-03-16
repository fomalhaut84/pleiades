module.exports = {
  apps: [{
    name: 'myfinance',
    script: 'node_modules/.bin/next',
    args: 'start -p 4100',
    cwd: '/home/nasty68/myFinance',
    env: {
      NODE_ENV: 'production',
      PORT: 4100,
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '1024M',
    node_args: '--max-old-space-size=1024',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
}
