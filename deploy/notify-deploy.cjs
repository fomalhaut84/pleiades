#!/usr/bin/env node
// notify-deploy.cjs — 자동 배포(ssh-deploy.sh) 결과를 그 앱의 봇으로 관리자에게 보낸다 (#304 · 옛 fin·fit 의 배포 완료 알림).
//
// 사용:  node deploy/notify-deploy.cjs <fin|fit> <ok|fail> <tag> <요약 한 줄>
//   봇 토큰·수신자는 그 앱의 서버 .env(apps/<dir>/.env)에서 읽는다 — GitHub secrets 에 두지 않는다(I-9).
//   수신자: fin = TELEGRAM_ADMIN_CHAT_IDS(관리자 경로) · fit = TELEGRAM_ALLOWED_CHAT_IDS(fit 은 관리자 경로가 없다 · 003 Q25)
//   Discord(T-10 · #314 · 사용자 2026-10-27): 플랫폼 설정에 NOTIFY_DEPLOY_CHANNEL=discord + DISCORD_WEBHOOK_DEPLOY 면 그 웹훅으로만(ADMIN 과 같은 채널이어도 된다 · #321) —
//   동시 모드 없음. Discord 전송이 실패하면 텔레그램으로 대신 보낸다(알림을 잃지 않게). 플랫폼 설정 = PLEIADES_ENV_FILE 또는 ~/pleiades-platform.env
//   (ssh-deploy 는 그 변수를 넘기지 않는다 — release-inplace.sh C1 과 같은 위치).
// 출력: 보낸 수 한 줄. 토큰·채팅 ID 는 내지 않는다. 알림 실패는 종료 코드 0(배포 결과를 바꾸지 않는다) + 사유 한 줄.
// 테스트: PLEIADES_TEST=1 NOTIFY_DRY_RUN=1 이면 보내지 않고 수신자 수·본문만 낸다.
// 인자 형식은 직전 판 ssh-deploy.sh 와 호환을 유지한다 — 도는 ssh-deploy 는 한 판 뒤처진 채 새 체크아웃의 이 파일을 부른다.
'use strict'

const fs = require('fs')
const os = require('os')
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

function readEnv(file, from = path.dirname(file)) {
  // 앱과 같은 dotenv 로 읽는다(그 앱의 node_modules) — 손으로 짠 해석은 따옴표·주석에서 어긋났다(#186)
  const dotenv = require(require.resolve('dotenv', { paths: [from] }))
  return dotenv.parse(fs.readFileSync(file))
}

// 배포 알림 Discord 웹훅 — 스위치가 discord 이고 웹훅이 있을 때만. 테스트는 PLEIADES_ENV_FILE 이 없으면 홈 파일을 읽지 않는다
function deployWebhook(appDir) {
  const file = process.env.PLEIADES_ENV_FILE || (process.env.PLEIADES_TEST === '1' ? '' : path.join(os.homedir(), 'pleiades-platform.env'))
  if (!file) return ''
  try {
    const env = readEnv(file, appDir)
    return env.NOTIFY_DEPLOY_CHANNEL === 'discord' ? env.DISCORD_WEBHOOK_DEPLOY || '' : ''
  } catch {
    return '' // 없음·읽기 실패 = 텔레그램(지금과 같다)
  }
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function buildText(app, status, tag, summary) {
  const head = status === 'ok' ? `✅ <b>${app} ${tag} 배포 완료</b>` : `⚠️ <b>${app} ${tag} 배포 중단</b>`
  const line = escapeHtml(summary.slice(0, SUMMARY_MAX))
  const tail = status === 'ok' ? '' : '\n판정 양식(재시도 · R-8 안내)은 Actions 실행 요약에'
  return `${head}\n${line}${tail}\n${RELEASE_URL}${tag}`
}

// Discord 본문 — 텔레그램 HTML 의 <b> 만 굵게로 · 요약의 마크다운 기호는 escape(멘션은 allowed_mentions 로 막는다)
function toDiscord(text) {
  const unescapeHtml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  const md = (s) => s.replace(/([\\*_~`|>#[\]-])/g, '\\$1')
  return text
    .split('\n')
    .map((line) => {
      const m = /^(.*?)<b>(.*)<\/b>$/.exec(line)
      if (m) return `${m[1]}**${md(unescapeHtml(m[2]))}**`
      return /^https:\/\//.test(line) ? line : md(unescapeHtml(line))
    })
    .join('\n')
}

async function postJson(url, body) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    // 본문은 쓰지 않는다 — 끊어 두어야 keep-alive 로 프로세스가 늦게 끝나지 않는다
    if (res.body && typeof res.body.cancel === 'function') await res.body.cancel().catch(() => {})
    return res.ok ? null : `HTTP ${res.status}`
  } catch (err) {
    // 오류 메시지에 요청 URL(토큰 · 웹훅 비밀)이 실릴 수 있다 — 이름만 낸다
    return err && err.name ? err.name : 'error'
  } finally {
    clearTimeout(timer)
  }
}

const send = (token, chatId, text) =>
  postJson(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
const sendDiscord = (webhook, text) => postJson(webhook, { content: toDiscord(text), allowed_mentions: { parse: [] } })

async function main() {
  const [app, status, tag, ...rest] = process.argv.slice(2)
  const cfg = APPS[app]
  if (!cfg || !['ok', 'fail'].includes(status) || !TAG_RE.test(tag || '')) fail('사용법: <fin|fit> <ok|fail> <vX.Y.Z> <요약>')
  const summary = rest.join(' ').trim() || (status === 'ok' ? '통과' : '중단')

  const text = buildText(app, status, tag, summary)
  const appDir = path.join(ROOT, 'apps', cfg.dir)
  const webhook = deployWebhook(appDir)
  let discordError = ''
  if (webhook) {
    if (process.env.PLEIADES_TEST === '1' && process.env.NOTIFY_DRY_RUN === '1') {
      console.log('notify-deploy: (dry-run) Discord 배포 채널')
      console.log(toDiscord(text))
      return
    }
    const err = await sendDiscord(webhook, text)
    if (!err) {
      console.log(`notify-deploy: ${app} 보냄 Discord 배포 채널`)
      return
    }
    discordError = err
  }

  let env
  try {
    env = readEnv(path.join(appDir, '.env'))
  } catch {
    fail(`${app} 앱 .env 를 읽지 못했다${discordError ? ` · Discord 실패 ${discordError}` : ''}`)
  }
  const token = env.TELEGRAM_BOT_TOKEN || ''
  const chats = (env[cfg.chatsKey] || '').split(',').map((s) => s.trim()).filter((s) => /^-?\d+$/.test(s))
  if (!token) fail(`${app} 봇 토큰이 비어 있다`)
  if (chats.length === 0) fail(`${app} 수신자(${cfg.chatsKey})가 비어 있다`)

  if (process.env.PLEIADES_TEST === '1' && process.env.NOTIFY_DRY_RUN === '1') {
    console.log(`notify-deploy: (dry-run) 수신자 ${chats.length}`)
    console.log(text)
    return
  }
  const errors = (await Promise.all(chats.map((c) => send(token, c, text)))).filter(Boolean)
  const via = discordError ? ` (Discord 실패 ${discordError} — 텔레그램으로 대신)` : ''
  console.log(`notify-deploy: ${app} 보냄 ${chats.length - errors.length}/${chats.length}${errors.length ? ` · 실패 ${errors.join(',')}` : ''}${via}`)
}

main().then(() => process.exit(0), () => fail('예외'))
