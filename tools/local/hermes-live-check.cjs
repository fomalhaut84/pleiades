#!/usr/bin/env node
// hermes-live-check.cjs — 로컬 hermes(루프백)에 정해 둔 묶음을 보내 받기 응답 · 게시 결과(상태 파일)를 실측한다 (014 H-1c · #798).
//
// 1) 준비(임시 디렉터리 · 저장소 밖 — 예: scratchpad):
//      node tools/local/hermes-live-check.cjs setup <dir>
//    → <dir>/sources.json(출처 `live` · 링크 허용 호스트 example.com) · <dir>/key(0600 · 출력하지 않는다) · <dir>/state/
// 2) hermes 기동(앱 .env 에 PORT · HERMES_STATE_DIR=<dir>/state · HERMES_REGISTRY=<dir>/sources.json):
//      PATH=/usr/local/bin:$PATH tools/local/run.sh hrm -- node --env-file=.env dist/hermes.cjs
//    검증 #hermes 웹훅만 — run.sh 가 check_env 로 웹훅 해시 허용 목록을 본다(I-5′)
// 3) 실측:  node tools/local/hermes-live-check.cjs run <dir> [port=4700]
//    받기 응답 표 → 상태 파일이 queued 0 이 될 때까지(최대 60 s) 기다려 수치를 낸다. 화면은 검증 채널에서 본다.
// 키 · 웹훅은 출력하지 않는다. 끝나면 <dir> 를 지운다.
'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** 014 §3-H — `hrm_` + base62 43자 · 16진수 밖 글자 · 숫자 · 영문 모두(수집기 일반 토큰 검사가 잡는 모양) */
function newKey() {
  for (;;) {
    const bytes = crypto.randomBytes(64)
    let body = ''
    for (const b of bytes) {
      if (b < 248) body += BASE62[b % 62] // 248 = 62 × 4 — 치우침 없이
      if (body.length === 43) break
    }
    if (body.length === 43 && /[g-zG-Z]/.test(body) && /\d/.test(body) && /[A-Za-z]/.test(body)) return `hrm_${body}`
  }
}

function setup(dir) {
  fs.mkdirSync(path.join(dir, 'state'), { recursive: true, mode: 0o700 })
  const key = newKey()
  fs.writeFileSync(path.join(dir, 'key'), key, { mode: 0o600 })
  const sha = crypto.createHash('sha256').update(key).digest('hex')
  const reg = { sources: [{ id: 'live', name: '실측', keySha256: sha, enabled: true, linkHosts: ['example.com'], ratePerMinute: 60 }] }
  fs.writeFileSync(path.join(dir, 'sources.json'), `${JSON.stringify(reg, null, 2)}\n`, { mode: 0o600 })
  console.log(`setup: ${dir} — sources.json · key(0600) · state/ (키는 출력하지 않는다)`)
  console.log(`앱 .env 에 넣을 줄(절대 경로):\nHERMES_STATE_DIR=${path.join(dir, 'state')}\nHERMES_REGISTRY=${path.join(dir, 'sources.json')}`)
}

const CASES = [
  { name: '평문 · 제목', body: { title: '새 주문', text: '주문 #20261118-0001 · 5kg × 2 · 58,000원' }, want: 202 },
  { name: 'warn · 허용 링크', body: { title: '재고 부족', text: '귤 5kg 남은 수량 3', level: 'warn', link: { label: '관리 화면', url: 'https://example.com/admin/stock?item=1' } }, want: 202 },
  { name: '허용 밖 링크(줄 빠짐)', body: { text: '허용 밖 링크 시험', link: { label: '다른 곳', url: 'https://evil.example/x' } }, want: 202 },
  { name: '서식 · 맨 주소 escape', body: { text: '# 제목 아님\n- 목록 아님 · **굵게 아님** · <@123> · http://evil.example/x' }, want: 202 },
  { name: '개인정보 → 차단 문구', body: { text: '연락처 010-1234-5678' }, want: 202 },
  { name: '중복 키 1', body: { text: '중복 시험' }, idem: 'live-dup-1', want: 202 },
  { name: '중복 키 2(duplicate)', body: { text: '중복 시험' }, idem: 'live-dup-1', want: 202, dup: true },
  { name: '형식 오류(http 링크)', body: { text: 'a', link: { label: 'x', url: 'http://example.com' } }, want: 400 },
  { name: '틀린 키', body: { text: 'a' }, key: `hrm_${'Q'.repeat(43)}`, want: 401 },
]

async function run(dir, port) {
  const key = fs.readFileSync(path.join(dir, 'key'), 'utf8').trim()
  const base = `http://127.0.0.1:${port}`
  const health = await fetch(`${base}/v1/health`).then((r) => r.status).catch(() => 0)
  if (health !== 200) {
    console.error(`hermes 가 ${base} 에서 응답하지 않는다(health ${health})`)
    process.exit(1)
  }
  // 이번 실행 뒤에 쓰인 상태만 본다 — 같은 hermes 에 다시 돌리면 이전 실행의 queued 0 · lastSentAt 이 남아 있다(#799 Codex P2)
  const started = Date.now()
  let fail = 0
  console.log('| 시나리오 | 기대 | 응답 | 판정 |\n|---|---|---|---|')
  for (const c of CASES) {
    const headers = { authorization: `Bearer ${c.key ?? key}`, 'content-type': 'application/json' }
    if (c.idem) headers['idempotency-key'] = c.idem
    const r = await fetch(`${base}/v1/messages`, { method: 'POST', headers, body: JSON.stringify(c.body) })
    const j = await r.json().catch(() => ({}))
    const ok = r.status === c.want && (c.dup === undefined || j.duplicate === c.dup)
    if (!ok) fail++
    const extra = j.reason ? ` reason=${j.reason}` : j.duplicate ? ' duplicate' : ''
    console.log(`| ${c.name} | ${c.want} | ${r.status}${extra} | ${ok ? '통과' : '실패'} |`)
  }
  const file = path.join(dir, 'state', 'state.json')
  let st = null
  for (let i = 0; i < 60; i++) {
    await new Promise((res) => setTimeout(res, 1000))
    try {
      st = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    const fresh = Date.parse(st.updatedAt) >= started && st.lastSentAt !== null && Date.parse(st.lastSentAt) >= started
    if (fresh && st.queued === 0) break
    st = fresh ? st : null
  }
  if (st === null) {
    console.log('이번 실행 뒤의 상태 파일이 60 s 안에 나오지 않았다(게시 멈춤 · 웹훅 · 로그 확인)')
    process.exit(1)
  }
  const pick = ({ queued, dead, deadToday, blockedToday, linkDroppedToday, webhook, paused, registrySources, registryError }) => ({
    queued, dead, deadToday, blockedToday, linkDroppedToday, webhook, paused, registrySources, registryError,
  })
  console.log(`상태: ${JSON.stringify(pick(st))}`)
  const wantState = st.queued === 0 && st.blockedToday >= 1 && st.linkDroppedToday >= 1 && st.deadToday === 0 && st.webhook === true
  console.log(`결과: 받기 ${CASES.length - fail}/${CASES.length} · 상태 ${wantState ? '기대대로' : '확인 필요'}`)
  process.exit(fail === 0 && wantState ? 0 : 1)
}

const [cmd, dir, port] = process.argv.slice(2)
if (cmd === 'setup' && dir) setup(path.resolve(dir))
else if (cmd === 'run' && dir) run(path.resolve(dir), Number(port || 4700))
else {
  console.error('사용법: hermes-live-check.cjs setup <dir> | run <dir> [port]')
  process.exit(2)
}
