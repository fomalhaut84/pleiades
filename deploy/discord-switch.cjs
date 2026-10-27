#!/usr/bin/env node
// discord-switch.cjs — discord-switch.sh 의 노드 쪽 (#314 · 007 T-10). 플랫폼 설정 파일을 읽고·점검하고·스위치 줄만 고친다.
//
// 사용:  node deploy/discord-switch.cjs check <파일> [--no-send]   필요한 키 · 형식 · (기본) 웹훅·봇 채널에 시험 메시지 1건씩
//        node deploy/discord-switch.cjs set <파일> <discord|telegram>   스위치 4줄만 바꾼다(나머지 줄·주석·권한 그대로)
//        node deploy/discord-switch.cjs state <파일>                    스위치 4줄의 지금 값
// 출력: 판정 양식 줄("F <줄>")과 마지막 "RESULT ok|fail". 값(웹훅 URL · 토큰 · ID)은 내지 않는다 — 키 이름과 개수만.
// 의존성 없음 — 해석은 packages/notify platform-env 와 같은 규칙(따옴표 값 · 따옴표 없는 값은 " #" 앞까지)으로 플랫폼 키만.
'use strict'

const fs = require('fs')
const path = require('path')

// 라우트 스위치 — 텍스트 2 · 버튼 1 · 배포 알림 1(#304). 켤 때·끌 때 넷을 함께 바꾼다(동시 모드 없음 · 사용자 2026-10-22)
const SWITCHES = ['NOTIFY_ALLOWED_CHANNEL', 'NOTIFY_ADMIN_CHANNEL', 'NOTIFY_INTERACTIVE_CHANNEL', 'NOTIFY_DEPLOY_CHANNEL']
const WEBHOOKS = { FINANCE: 'DISCORD_WEBHOOK_FINANCE', FITNESS: 'DISCORD_WEBHOOK_FITNESS', ADMIN: 'DISCORD_WEBHOOK_ADMIN', DEPLOY: 'DISCORD_WEBHOOK_DEPLOY' }
const BOTS = { FINANCE: ['DISCORD_BOT_TOKEN_FINANCE', 'DISCORD_CHANNEL_ID_FINANCE'], FITNESS: ['DISCORD_BOT_TOKEN_FITNESS', 'DISCORD_CHANNEL_ID_FITNESS'] }
const ALLOWED_USERS = 'DISCORD_ALLOWED_USER_IDS'
const REQUIRED = [...Object.values(WEBHOOKS), ...Object.values(BOTS).flat(), ALLOWED_USERS]
const WEBHOOK_RE = /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/
const SNOWFLAKE_RE = /^\d{17,20}$/
const TOKEN_RE = /^\S{20,}$/
const KEY_RE = /^(?:NOTIFY_[A-Z0-9_]+|DISCORD_[A-Z0-9_]+)$/
const LINE_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/
const DISCORD_BASE = 'https://discord.com'
const TIMEOUT_MS = 10_000
const PROBE_TEXT = '🔧 pleiades T-10 점검 메시지 — 이 경로로 알림이 온다(무시해도 된다)'

const out = (line) => console.log(`F ${line}`)
const finish = (ok) => {
  console.log(`RESULT ${ok ? 'ok' : 'fail'}`)
  process.exit(ok ? 0 : 1)
}

function parseValue(raw) {
  const v = raw.trim()
  const q = v.charAt(0)
  if (q === '"' || q === "'") {
    const end = v.indexOf(q, 1)
    if (end < 0) return undefined
    const rest = v.slice(end + 1).trim()
    return rest === '' || rest.charAt(0) === '#' ? v.slice(1, end) : undefined
  }
  const cut = /\s#/.exec(v)
  return (cut === null ? v : v.slice(0, cut.index)).trim()
}

function parse(text) {
  const values = {}
  const invalid = []
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue
    const m = LINE_RE.exec(line)
    if (m === null || !KEY_RE.test(m[1])) continue
    const v = parseValue(m[2])
    if (v === undefined) invalid.push(m[1])
    else values[m[1]] = v
  }
  return { values, invalid }
}

function read(file) {
  try {
    return parse(fs.readFileSync(file, 'utf8'))
  } catch {
    out('플랫폼 설정을 읽지 못했다')
    return finish(false)
  }
}

// 테스트만 Discord 주소를 로컬 스텁으로 바꾼다 — 운영 env 에 남은 값이 전송 대상을 바꾸지 않게
function api(url) {
  const base = process.env.PLEIADES_TEST === '1' ? process.env.PLEIADES_DISCORD_BASE : undefined
  return base ? url.replace(/^https:\/\/(?:discord|discordapp)\.com/, base) : url
}

async function post(url, body, headers = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(api(url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ content: body, allowed_mentions: { parse: [] } }),
      signal: ctrl.signal,
    })
    if (res.body && typeof res.body.cancel === 'function') await res.body.cancel().catch(() => {})
    return res.ok ? null : `HTTP ${res.status}`
  } catch (err) {
    // 오류 메시지에 URL(웹훅 비밀)이 실릴 수 있다 — 이름만
    return err && err.name ? err.name : 'error'
  } finally {
    clearTimeout(timer)
  }
}

function formatErrors(values) {
  const bad = []
  for (const k of Object.values(WEBHOOKS)) if (values[k] && !WEBHOOK_RE.test(values[k])) bad.push(k)
  for (const [tokenKey, channelKey] of Object.values(BOTS)) {
    if (values[tokenKey] && !TOKEN_RE.test(values[tokenKey])) bad.push(tokenKey)
    if (values[channelKey] && !SNOWFLAKE_RE.test(values[channelKey])) bad.push(channelKey)
  }
  const users = (values[ALLOWED_USERS] || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (values[ALLOWED_USERS] && (users.length === 0 || !users.every((u) => SNOWFLAKE_RE.test(u)))) bad.push(ALLOWED_USERS)
  return bad
}

async function check(file, send) {
  const { values, invalid } = read(file)
  const missing = REQUIRED.filter((k) => !values[k])
  const bad = formatErrors(values)
  out(`키 ${REQUIRED.length - missing.length}/${REQUIRED.length} 채움${missing.length ? ` · 비어 있음 ${missing.join(',')}` : ''}`)
  out(`형식 오류 ${bad.length}${bad.length ? ` (${bad.join(',')})` : ''} · 해석 불가 줄 ${invalid.length}${invalid.length ? ` (${invalid.join(',')})` : ''}`)
  // 배포 알림은 별도 채널(사용자 2026-10-27) — 다른 웹훅과 같으면 알린다(막지는 않는다)
  const dup = Object.entries(WEBHOOKS).filter(([a, k]) => a !== 'DEPLOY' && values[k] && values[k] === values[WEBHOOKS.DEPLOY]).map(([a]) => a)
  if (dup.length) out(`참고: 배포 웹훅이 ${dup.join(',')} 와 같다 — 별도 채널이 아니다`)
  const users = (values[ALLOWED_USERS] || '').split(',').filter((s) => s.trim()).length
  out(`버튼 허용 사용자 ${users}명`)
  if (missing.length || bad.length || invalid.length) return finish(false)
  if (!send) {
    out('시험 전송 생략(--no-send)')
    return finish(true)
  }
  const hooks = await Promise.all(Object.entries(WEBHOOKS).map(async ([alias, k]) => [alias, await post(`${values[k]}?wait=true`, `${PROBE_TEXT} · ${alias}`)]))
  const bots = await Promise.all(
    Object.entries(BOTS).map(async ([alias, [tokenKey, channelKey]]) => [
      alias,
      await post(`${DISCORD_BASE}/api/v10/channels/${values[channelKey]}/messages`, `${PROBE_TEXT} · 봇 ${alias}`, {
        authorization: `Bot ${values[tokenKey]}`,
      }),
    ]),
  )
  const failed = (rows) => rows.filter(([, e]) => e).map(([a, e]) => `${a} ${e}`)
  const fh = failed(hooks)
  const fb = failed(bots)
  out(`시험 전송 웹훅 ${hooks.length - fh.length}/${hooks.length}${fh.length ? ` · 실패 ${fh.join(',')}` : ''} · 봇 ${bots.length - fb.length}/${bots.length}${fb.length ? ` · 실패 ${fb.join(',')}` : ''}`)
  return finish(fh.length === 0 && fb.length === 0)
}

function stateLine(values) {
  return SWITCHES.map((k) => `${k.replace(/^NOTIFY_|_CHANNEL$/g, '')}=${values[k] === 'discord' ? 'discord' : 'telegram'}`).join(' ')
}

// 스위치 줄만 바꾼다 — 같은 디렉터리 임시 파일(600)에 쓰고 rename(중간 상태를 앱이 읽지 않게 · mtime 이 바뀌어 웹은 다음 호출부터 반영)
function set(file, to) {
  if (to !== 'discord' && to !== 'telegram') {
    out('사용법: set <파일> <discord|telegram>')
    return finish(false)
  }
  const value = to === 'discord' ? 'discord' : ''
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    out('플랫폼 설정을 읽지 못했다')
    return finish(false)
  }
  const seen = new Set()
  const lines = text.split('\n').map((line) => {
    const m = LINE_RE.exec(line)
    if (/^\s*#/.test(line) || m === null || !SWITCHES.includes(m[1])) return line
    seen.add(m[1])
    return `${m[1]}="${value}"`
  })
  const missing = SWITCHES.filter((k) => !seen.has(k))
  if (missing.length) {
    if (lines.length && lines[lines.length - 1] === '') lines.pop()
    lines.push(...missing.map((k) => `${k}="${value}"`), '')
  }
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`)
  try {
    fs.writeFileSync(tmp, lines.join('\n'), { mode: 0o600 })
    fs.chmodSync(tmp, 0o600)
    fs.renameSync(tmp, file)
  } catch {
    try {
      fs.unlinkSync(tmp)
    } catch {}
    out('플랫폼 설정을 쓰지 못했다')
    return finish(false)
  }
  out(`스위치 ${stateLine(read(file).values)}${missing.length ? ` (줄 추가 ${missing.length})` : ''}`)
  return finish(true)
}

function main() {
  const [cmd, file, ...rest] = process.argv.slice(2)
  if (!file) {
    out('사용법: <check|set|state> <파일> …')
    return finish(false)
  }
  if (cmd === 'check') return check(file, !rest.includes('--no-send'))
  if (cmd === 'set') return set(file, rest[0])
  if (cmd === 'state') {
    out(`스위치 ${stateLine(read(file).values)}`)
    return finish(true)
  }
  out('사용법: <check|set|state> <파일> …')
  return finish(false)
}

Promise.resolve(main()).catch(() => {
  out('예외')
  finish(false)
})
