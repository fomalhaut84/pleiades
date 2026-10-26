#!/usr/bin/env node
// notify-deploy.cjs — 자동 배포(ssh-deploy.sh) 결과를 그 앱의 봇으로 관리자에게 보낸다 (#304 · 옛 fin·fit 의 배포 완료 알림).
//
// 사용:  node deploy/notify-deploy.cjs <fin|fit> <ok|fail> <tag> <요약 한 줄>
//   봇 토큰·수신자는 그 앱의 서버 .env(apps/<dir>/.env)에서 읽는다 — GitHub secrets 에 두지 않는다(I-9).
//   수신자: fin = TELEGRAM_ADMIN_CHAT_IDS(관리자 경로) · fit = TELEGRAM_ALLOWED_CHAT_IDS(fit 은 관리자 경로가 없다 · 003 Q25)
//   Discord 별도 채널은 T-10 에서(사용자 2026-10-26) — 지금은 텔레그램만.
// 출력: 보낸 수 한 줄. 토큰·채팅 ID 는 내지 않는다. 알림 실패는 종료 코드 0(배포 결과를 바꾸지 않는다) + 사유 한 줄.
// 테스트: PLEIADES_TEST=1 NOTIFY_DRY_RUN=1 이면 보내지 않고 수신자 수·본문만 낸다.
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const APPS = { fin: { dir: 'finance', chatsKey: 'TELEGRAM_ADMIN_CHAT_IDS' }, fit: { dir: 'fitness', chatsKey: 'TELEGRAM_ALLOWED_CHAT_IDS' } }
const TAG_RE = /^v\d+\.\d+\.\d+$/
const RELEASE_URL = 'https://github.com/fomalhaut84/pleiades/releases/tag/'
const SUMMARY_MAX = 300
const TIMEOUT_MS = 10_000

function fail(msg) {
  console.log(`notify-deploy: 보내지 않았다 — ${msg}`)
  process.exit(0)
}

function readEnv(file) {
  // 앱과 같은 dotenv 로 읽는다(그 앱의 node_modules) — 손으로 짠 해석은 따옴표·주석에서 어긋났다(#186)
  const dotenv = require(require.resolve('dotenv', { paths: [path.dirname(file)] }))
  return dotenv.parse(fs.readFileSync(file))
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function buildText(app, status, tag, summary) {
  const head = status === 'ok' ? `✅ <b>${app} ${tag} 배포 완료</b>` : `⚠️ <b>${app} ${tag} 배포 중단</b>`
  const line = escapeHtml(summary.slice(0, SUMMARY_MAX))
  const tail = status === 'ok' ? '' : '\n판정 양식(재시도 · R-8 안내)은 Actions 실행 요약에'
  return `${head}\n${line}${tail}\n${RELEASE_URL}${tag}`
}

async function send(token, chatId, text) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: ctrl.signal,
    })
    return res.ok ? null : `HTTP ${res.status}`
  } catch (err) {
    // 오류 메시지에 요청 URL(토큰)이 실릴 수 있다 — 이름만 낸다
    return err && err.name ? err.name : 'error'
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const [app, status, tag, ...rest] = process.argv.slice(2)
  const cfg = APPS[app]
  if (!cfg || !['ok', 'fail'].includes(status) || !TAG_RE.test(tag || '')) fail('사용법: <fin|fit> <ok|fail> <vX.Y.Z> <요약>')
  const summary = rest.join(' ').trim() || (status === 'ok' ? '통과' : '중단')

  let env
  try {
    env = readEnv(path.join(ROOT, 'apps', cfg.dir, '.env'))
  } catch {
    fail(`${app} 앱 .env 를 읽지 못했다`)
  }
  const token = env.TELEGRAM_BOT_TOKEN || ''
  const chats = (env[cfg.chatsKey] || '').split(',').map((s) => s.trim()).filter((s) => /^-?\d+$/.test(s))
  if (!token) fail(`${app} 봇 토큰이 비어 있다`)
  if (chats.length === 0) fail(`${app} 수신자(${cfg.chatsKey})가 비어 있다`)

  const text = buildText(app, status, tag, summary)
  if (process.env.PLEIADES_TEST === '1' && process.env.NOTIFY_DRY_RUN === '1') {
    console.log(`notify-deploy: (dry-run) 수신자 ${chats.length}`)
    console.log(text)
    return
  }
  const errors = (await Promise.all(chats.map((c) => send(token, c, text)))).filter(Boolean)
  console.log(`notify-deploy: ${app} 보냄 ${chats.length - errors.length}/${chats.length}${errors.length ? ` · 실패 ${errors.join(',')}` : ''}`)
}

main().catch(() => fail('예외'))
