module.exports = {
  apps: [
    {
      name: 'myfinance',
      script: 'node_modules/.bin/next',
      args: 'start -p 4100',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 4100,
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '1024M',
      node_args: '--max-old-space-size=1024',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'myfinance-bot',
      script: 'dist/bot/standalone.cjs',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      // SIGTERM → bot.stop() 의 long-poll abort 완료까지 시간 확보 (기본 1.6s → 15s)
      kill_timeout: 15000,
      // 정상 동작 안정성 기준 — 30초 이상 살아있어야 안정으로 간주
      min_uptime: 30000,
      // 지수 백오프 무한 재시도 (100ms → 200ms → 400ms ... 최대 15s 사이클).
      // max_restarts 의 영구 stop 위험 (transient 외부 장애 시 봇 죽음 → 알림 채널 단일 장애점) 회피.
      // 외부 장애 회복까지 기다리고, 진짜 코드 버그 시에도 간격이 점차 늘어 로그 폭증/리소스 낭비 차단.
      exp_backoff_restart_delay: 100,
      max_memory_restart: '512M',
      node_args: '--max-old-space-size=512',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
