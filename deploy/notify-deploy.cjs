#!/usr/bin/env node
// notify-deploy.cjs — 자동 배포(ssh-deploy.sh) 결과를 Discord 배포 채널로 보낸다 (#304 · T-10 #314 · 009 D-5 B1 #502).
//
// 사용:  node deploy/notify-deploy.cjs <fin|fit> <ok|fail> <tag> <요약 한 줄>
//   웹훅: 플랫폼 설정의 DISCORD_WEBHOOK_DEPLOY(ADMIN 과 같은 채널이어도 된다 · #321). 플랫폼 설정 = PLEIADES_ENV_FILE 또는
//   ~/pleiades-platform.env (ssh-deploy 는 그 변수를 넘기지 않는다 — release-inplace.sh C1 과 같은 위치). GitHub secrets 에 두지 않는다(I-9).
//   스위치(NOTIFY_DEPLOY_CHANNEL)는 읽지 않는다 — 늘 Discord. 텔레그램 대체 전송은 B1 에서 지웠다(돌아갈 텔레그램이 없다).
// 출력: 보낸 결과 한 줄. 웹훅은 내지 않는다. 알림 실패·웹훅 없음은 종료 코드 0(배포 결과를 바꾸지 않는다) + 사유 한 줄.
// 테스트: PLEIADES_TEST=1 NOTIFY_DRY_RUN=1 이면 보내지 않고 본문만 낸다.
// 인자 형식은 직전 판 ssh-deploy.sh 와 호환을 유지한다 — 도는 ssh-deploy 는 한 판 뒤처진 채 새 체크아웃의 이 파일을 부른다.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const APPS = { fin: 'finance', fit: 'fitness' }
const TAG_RE = /^v\d+\.\d+\.\d+$/
const RELEASE_URL = 'https://github.com/fomalhaut84/pleiades/releases/tag/'
const SUMMARY_MAX = 300
const TIMEOUT_MS = 10_000

function fail(msg) {
  console.log(`notify-deploy: 보내지 않았다 — ${msg}`)
  process.exit(0)
}

function readEnv(file, from) {
  // 앱과 같은 dotenv 로 읽는다(그 앱의 node_modules) — 손으로 짠 해석은 따옴표·주석에서 어긋났다(#186)
  const dotenv = require(require.resolve('dotenv', { paths: [from] }))
  return dotenv.parse(fs.readFileSync(file))
}

// 배포 알림 Discord 웹훅. 테스트는 PLEIADES_ENV_FILE 이 없으면 홈 파일을 읽지 않는다
function deployWebhook(appDir) {
  const file = process.env.PLEIADES_ENV_FILE || (process.env.PLEIADES_TEST === '1' ? '' : path.join(os.homedir(), 'pleiades-platform.env'))
  if (!file) return ''
  try {
    return readEnv(file, appDir).DISCORD_WEBHOOK_DEPLOY || ''
  } catch {
    return ''
  }
}

// 요약의 마크다운 기호는 escape(멘션은 allowed_mentions 로 막는다)
const md = (s) => s.replace(/([\\*_~`|<>#[\]-])/g, '\\$1')

function buildText(app, status, tag, summary) {
  const head = status === 'ok' ? `✅ **${md(`${app} ${tag} 배포 완료`)}**` : `⚠️ **${md(`${app} ${tag} 배포 중단`)}**`
  const tail = status === 'ok' ? '' : '\n판정 양식(재시도 · R\\-8 안내)은 Actions 실행 요약에'
  return `${head}\n${md(summary.slice(0, SUMMARY_MAX))}${tail}\n${RELEASE_URL}${tag}`
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
    // 오류 메시지에 요청 URL(웹훅 비밀)이 실릴 수 있다 — 이름만 낸다
    return err && err.name ? err.name : 'error'
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const [app, status, tag, ...rest] = process.argv.slice(2)
  const dir = APPS[app]
  if (!dir || !['ok', 'fail'].includes(status) || !TAG_RE.test(tag || '')) fail('사용법: <fin|fit> <ok|fail> <vX.Y.Z> <요약>')
  const summary = rest.join(' ').trim() || (status === 'ok' ? '통과' : '중단')

  const text = buildText(app, status, tag, summary)
  const webhook = deployWebhook(path.join(ROOT, 'apps', dir))
  if (!webhook) fail('DISCORD_WEBHOOK_DEPLOY 가 비어 있다(플랫폼 설정)')
  if (process.env.PLEIADES_TEST === '1' && process.env.NOTIFY_DRY_RUN === '1') {
    console.log('notify-deploy: (dry-run) Discord 배포 채널')
    console.log(text)
    return
  }
  const err = await postJson(webhook, { content: text, allowed_mentions: { parse: [] } })
  console.log(err ? `notify-deploy: ${app} Discord 배포 채널 실패 ${err}` : `notify-deploy: ${app} 보냄 Discord 배포 채널`)
}

main().then(() => process.exit(0), () => fail('예외'))
