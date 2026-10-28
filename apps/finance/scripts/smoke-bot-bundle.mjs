#!/usr/bin/env node
/**
 * 봇 번들 로드 스모크 (#518).
 *
 * dist/bot/standalone.cjs 를 실제로 기동해 main() 진입 로그까지 도달하는지 확인한다.
 * 번들 최상단 모듈 평가에서 죽는 회귀 (예: ESM 의존성의 import.meta.url 이 CJS 번들에서
 * 빈 값 → `TypeError: Invalid URL`) 는 lint/typecheck/test/build 를 모두 통과하고 배포 후
 * PM2 재시작 루프로만 드러났다.
 *
 * 부작용 차단 — 3겹 (pleiades 009 D-1 · pleiades#349). 서버에서는 운영자 셸 env(운영 플랫폼 설정 경로 포함)로 돈다:
 *   ① `--smoke` 인자 — 진입 로그 직후 어떤 등록·토큰·DB·gateway 보다 먼저 exit 0. 인자라 운영 pm2 프로세스로 새지 않는다
 *      (deploy/pleiades.config.cjs 봇 정의에 args 없음 · deploy/ 정적 테스트)
 *   ② 무효 텔레그램 토큰 — ①을 잃어도 실토큰으로 폴링하지 않는다(텔레그램 실패는 이제 비치명이라 ②만으로는 막지 못한다)
 *   ③ 운영 접속값을 **덮는다** — Discord 토큰·웹훅 빈 값 · `PLEIADES_ENV_FILE=/dev/null`(빈 문자열이면 루트 .env 탐색으로
 *      떨어진다) · `DATABASE_URL` 은 듣는 곳 없는 주소. 지우지 않는 이유: 지우면 dotenv 가 앱 .env 로, platformEnv 가
 *      다음 출처로 다시 채운다(dotenv 는 이미 있는 키를 덮지 않는다)
 * 진입 로그를 보는 즉시 kill 하는 것은 그대로다.
 */

import { spawn } from 'node:child_process'

const BUNDLE = 'dist/bot/standalone.cjs'
const READY_MARKER = '[bot] standalone 프로세스 시작...'
const TIMEOUT_MS = 30_000
const INVALID_TOKEN = '000000:smoke-test-invalid-token'
const SMOKE_ARG = '--smoke'
/** 듣는 곳 없는 주소 — 연결을 시도해도 거부된다(007 T-4 더미 규칙) */
const DUMMY_DATABASE_URL = 'postgresql://smoke:smoke@127.0.0.1:1/smoke'

/** 스모크 자식 env — 운영 접속값을 덮는다(③). 플랫폼 키는 이름을 열거하지 않고 PLEIADES_ENV_FILE 로 통째로 막고, 셸에 있는 것도 비운다 */
function smokeEnv(parent) {
  const blanked = Object.fromEntries(
    Object.keys(parent)
      .filter((k) => k.startsWith('DISCORD_') || k.startsWith('NOTIFY_'))
      .map((k) => [k, '']),
  )
  return {
    ...parent,
    ...blanked,
    DISCORD_BOT_TOKEN_FINANCE: '',
    DISCORD_BOT_TOKEN_FITNESS: '',
    PLEIADES_ENV_FILE: '/dev/null',
    DATABASE_URL: DUMMY_DATABASE_URL,
    TELEGRAM_BOT_TOKEN: INVALID_TOKEN,
    NODE_ENV: 'production',
  }
}

const child = spawn(process.execPath, [BUNDLE, SMOKE_ARG], {
  env: smokeEnv(process.env),
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stdout = ''
let stderr = ''
let settled = false

function finish(ok, reason) {
  if (settled) return
  settled = true
  clearTimeout(timer)
  child.kill('SIGKILL')
  if (ok) {
    console.log(`[smoke:bot] OK — ${reason}`)
    process.exit(0)
  }
  console.error(`[smoke:bot] FAIL — ${reason}`)
  if (stderr.trim()) console.error(stderr.trim().split('\n').slice(0, 30).join('\n'))
  process.exit(1)
}

const timer = setTimeout(() => finish(false, `${TIMEOUT_MS}ms 내 main() 진입 로그 없음`), TIMEOUT_MS)

child.stdout.on('data', (chunk) => {
  stdout += chunk
  if (stdout.includes(READY_MARKER)) finish(true, 'main() 진입 확인')
})
child.stderr.on('data', (chunk) => {
  stderr += chunk
})
child.on('exit', (code, signal) => {
  if (stdout.includes(READY_MARKER)) finish(true, 'main() 진입 확인')
  else finish(false, `main() 진입 전 종료 (code=${code}, signal=${signal})`)
})
child.on('error', (err) => finish(false, `spawn 실패: ${err.message}`))
