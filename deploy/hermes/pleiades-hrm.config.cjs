// hermes pm2 정의 — 014 H-2(#800 · §3-A A1 · D9 · D10).
//
// 이름: pleiades-hrm-api 하나(D9 · 012 §3-4 G-R2) — 두 앱 정의(deploy/pleiades.config.cjs) · 통합 층 정의와 섞지 않는다.
//       두 앱 · 통합 층 배포는 모든 pleiades-* 의 PLEIADES_ENV_FILE 을 대조하므로 이 프로세스도 같은 값으로 떠야 한다(G-R1).
// env: PLEIADES_ENV_FILE 을 여기 두지 않는다 — deploy/hermes/hrm-inplace.sh 가 셸에 고정하고 `start --update-env` 로 넘긴다.
//      스크립트 밖에서 이 파일로 띄우지 않는다(다른 셸 env 로 뜨면 다음 두 앱 배포가 C1 에서 멈춘다 · 런북 hermes.md).
// 포트: 4700(루프백 · B1) — 서버 확인 U1(2026-11-18: 비어 있음 · fin·fit PORT·MCP_PORT 와 겹치지 않음). 배포 스크립트가 기동 전에
//       fin·fit 앱 .env 의 PORT·MCP_PORT 와 다시 견준다(N15). 바꾸면 런북 · 수집기(H-3)도 함께.
// 자리: 대기열 · 상태 · 출처 레지스트리는 체크아웃 밖 ~/pleiades-hermes-data/(§3-C · §3-D) — 체크아웃을 지워도 남는다.
// node: --disable-warning=ExperimentalWarning — 서버 node 24.12 는 node:sqlite 를 쓰면 경고 1줄을 stderr 로 낸다(U3 실측 ·
//       수집기가 경고로 센다 · D10).
const os = require('os')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const NAME = 'pleiades-hrm-api'
const PORT = '4700'
const DATA = path.join(os.homedir(), 'pleiades-hermes-data')
// deploy/pleiades.config.cjs NET_ARGS 와 같은 이유(T-2 U13 · #191) — 서버 node 의 family 자동 선택 250 ms 끊김
const NET_ARGS = '--network-family-autoselection-attempt-timeout=2000'

module.exports = {
  apps: [
    {
      name: NAME,
      cwd: path.join(ROOT, 'apps', 'hermes'),
      script: 'dist/hermes.cjs',
      instances: 1,
      autorestart: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // 종료 때 진행 중 게시 한 걸음(요청 상한 15 s)이 끝나기를 기다린다 — pm2 기본 1600 ms 면 중복 게시가 생길 수 있다(H-1b 9-1)
      kill_timeout: 20000,
      min_uptime: 30000,
      exp_backoff_restart_delay: 100,
      // pm2 는 RSS 로 판정한다 — 힙(256) 위로 여유(#825 · 두 앱 웹 #824 와 같은 이유)
      max_memory_restart: '384M',
      node_args: `--max-old-space-size=256 --disable-warning=ExperimentalWarning ${NET_ARGS}`,
      env: {
        NODE_ENV: 'production',
        PORT,
        HERMES_STATE_DIR: path.join(DATA, 'state'),
        HERMES_REGISTRY: path.join(DATA, 'sources.json'),
      },
    },
  ],
}
