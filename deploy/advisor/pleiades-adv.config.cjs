// 통합 층 pm2 정의 — 012 4b-3b(#699 · 설계 _workspace/239/4b3/02_writer_4b3_r3.md §4).
//
// 이름: pleiades-adv-bot 하나뿐(012 §3-4 G-R2) — 두 앱 정의(deploy/pleiades.config.cjs)와 섞지 않는다.
//       두 앱 배포의 C1·C5 는 모든 pleiades-* 의 PLEIADES_ENV_FILE 을 대조하므로 이 프로세스도 같은 값으로 떠야 한다(G-R1).
// env: PLEIADES_ENV_FILE 을 여기 두지 않는다 — deploy/advisor/adv-inplace.sh 가 셸에 고정하고 `start --update-env` 로 넘긴다.
//      스크립트 밖에서 이 파일로 띄우지 않는다(다른 셸 env 로 뜨면 다음 두 앱 배포가 C1 에서 멈춘다 · 런북 advisor-inplace.md).
// 옵션: 두 앱의 LONG_RUNNING 과 같은 값 — kill_timeout 15000 은 필수(pm2 기본 1600 ms 로는 종료 때 진행 중 질문의
//       정산 유예 10 s(apps/advisor/src/main.ts SHUTDOWN_GRACE_MS)를 줄 수 없다).
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const NAME = 'pleiades-adv-bot'
// deploy/pleiades.config.cjs NET_ARGS 와 같은 이유(T-2 U13 · #191) — 서버 node 의 family 자동 선택 250 ms 끊김
const NET_ARGS = '--network-family-autoselection-attempt-timeout=2000'

module.exports = {
  apps: [
    {
      name: NAME,
      cwd: path.join(ROOT, 'apps', 'advisor'),
      script: 'dist/advisor.cjs',
      args: 'bot',
      instances: 1,
      autorestart: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      kill_timeout: 15000,
      min_uptime: 30000,
      exp_backoff_restart_delay: 100,
      // pm2 는 RSS 로 판정한다 — 힙(512) 위로 여유(#825 · 두 앱 웹 #824 와 같은 이유)
      max_memory_restart: '768M',
      node_args: `--max-old-space-size=512 ${NET_ARGS}`,
      env: { NODE_ENV: 'production' },
    },
  ],
}
