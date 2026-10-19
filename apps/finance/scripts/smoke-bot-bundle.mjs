#!/usr/bin/env node
/**
 * 봇 번들 로드 스모크 (#518).
 *
 * dist/bot/standalone.cjs 를 실제로 기동해 main() 진입 로그까지 도달하는지 확인한다.
 * 번들 최상단 모듈 평가에서 죽는 회귀 (예: ESM 의존성의 import.meta.url 이 CJS 번들에서
 * 빈 값 → `TypeError: Invalid URL`) 는 lint/typecheck/test/build 를 모두 통과하고 배포 후
 * PM2 재시작 루프로만 드러났다.
 *
 * 부작용 차단: 무효 토큰을 강제 주입한다. main() 은 cron/스케줄러 등록 전에 bot.init()
 * (getMe) 에서 실패하므로 텔레그램 폴링·DB 쓰기 없이 종료된다. 진입 로그를 보는 즉시 kill.
 * dotenv 는 이미 설정된 환경변수를 덮어쓰지 않으므로 .env 의 실제 토큰은 쓰이지 않는다.
 */

import { spawn } from 'node:child_process'

const BUNDLE = 'dist/bot/standalone.cjs'
const READY_MARKER = '[bot] standalone 프로세스 시작...'
const TIMEOUT_MS = 30_000
const INVALID_TOKEN = '000000:smoke-test-invalid-token'

const child = spawn(process.execPath, [BUNDLE], {
  env: { ...process.env, TELEGRAM_BOT_TOKEN: INVALID_TOKEN, NODE_ENV: 'production' },
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
