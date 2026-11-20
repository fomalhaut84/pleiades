#!/usr/bin/env node
// stdio init 탐침 (#868 · 015 §0-4 · Q143 · H-R4 · H-R5) — `local` 제공자 호스트를 stdio 로 둘지 정하는 측정.
//
// 사용:  node tools/local/stdio-probe.cjs [--claude=<경로>] [--runs=10] [--hosts=1,3] [--host-delay=<ms>] [--host-ignore-eof] [--keep-api]
//   --host-ignore-eof = 양성 대조 — 호스트가 EOF 를 무시하게 해 고아 판정이 실제로 잡는지 본다(측정 결과가 아니다)
//
// 재는 것: 통합 층과 같은 CLI 인자 · 허용 env 로 stdio MCP 호스트 k 개를 붙여 띄우고
//   ① init 첫 줄의 서버 상태(connected · pending · failed …) ② init 첫 줄까지 시간
//   ③ CLI 를 SIGKILL 한 뒤 호스트가 stdin EOF 로 스스로 끝나는가(고아 수)
// 모델 호출 0 — 두 겹: init 첫 줄을 받자마자 SIGKILL · API 주소를 닫힌 로컬 포트로(--keep-api 면 둘째 겹을 끈다 — 쓰지 않는다)
// 쓰는 것: 임시 디렉터리(끝나면 지운다)뿐. 세션 기록을 남기지 않는다(--no-session-persistence). 원문 · 경로를 양식에 싣지 않는다.
// 같은 파일이 `--host <pid 디렉터리> <이름>` 으로 불리면 stdio MCP 호스트(가짜 리더)로 돈다 — 의존 패키지 0(서버에서도 그대로 돌 수 있다).
'use strict'

const { spawn, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// ── 호스트(가짜 `local` 리더) ─────────────────────────────────────────
// 줄 단위 JSON-RPC(MCP stdio). pid 파일을 쓰고 · initialize 를 받으면 표지를 남기고 · stdin 이 닫히면 끝난다(H-R4).
function host(dir, name) {
  const delay = Number(process.env.PROBE_HOST_DELAY_MS || 0)
  fs.writeFileSync(path.join(dir, `${name}.pid`), String(process.pid))
  const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`)
  const reply = (req) => {
    const ok = (result) => send({ jsonrpc: '2.0', id: req.id, result })
    if (req.method === 'initialize') {
      fs.writeFileSync(path.join(dir, `${name}.init`), '1')
      ok({ protocolVersion: (req.params && req.params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name, version: '0.0.0' } })
    } else if (req.method === 'tools/list') {
      ok({ tools: [{ name: 'ping', description: '탐침 도구', inputSchema: { type: 'object', properties: {} } }] })
    } else if (req.method === 'tools/call') {
      ok({ content: [{ type: 'text', text: 'pong' }] })
    } else if (req.method === 'ping') {
      ok({})
    } else if (req.id !== undefined) {
      send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'method not found' } })
    }
  }
  let buf = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (c) => {
    buf += c
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      let req
      try {
        req = JSON.parse(line)
      } catch {
        continue
      }
      if (delay > 0 && req.method === 'initialize') setTimeout(() => reply(req), delay)
      else reply(req)
    }
  })
  // H-R4 — 부모(CLI)가 죽으면 파이프가 닫힌다 · 양성 대조면 무시하고 남는다
  process.stdin.on('end', () => (process.env.PROBE_HOST_IGNORE_EOF === '1' ? setInterval(() => {}, 1000) : process.exit(0)))
}

// ── 탐침 ─────────────────────────────────────────────────────────────
const CLOSED_API = 'http://127.0.0.1:9' // discard 포트 — 리슨하지 않는다 · 연결 거부로 모델 요청이 바로 실패한다
const INIT_WAIT_MS = 30_000
const EOF_WAIT_MS = 5_000
// apps/advisor/src/cli.ts CHILD_ENV_ALLOW 와 같다 — 통합 층이 자식에게 주는 env 만
const CHILD_ENV_ALLOW =
  /^(HOME|PATH|USER|LOGNAME|SHELL|LANG|LC_[A-Z_]+|TZ|TMPDIR|TERM|CLAUDE_CONFIG_DIR|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_BASE_URL|HTTPS?_PROXY|https?_proxy|NO_PROXY|no_proxy|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR)$/

function parseArgs(argv) {
  const a = { claude: '', runs: 10, hosts: [1, 3], delay: 0, keepApi: false, ignoreEof: false }
  for (const x of argv) {
    const [k, v] = x.split(/=(.*)/s)
    if (k === '--claude') a.claude = v
    else if (k === '--runs') a.runs = Number(v)
    else if (k === '--hosts') a.hosts = v.split(',').map(Number)
    else if (k === '--host-delay') a.delay = Number(v)
    else if (k === '--keep-api') a.keepApi = true
    else if (k === '--host-ignore-eof') a.ignoreEof = true
    else throw new Error(`모르는 인자: ${k}`)
  }
  if (!Number.isInteger(a.runs) || a.runs < 1 || a.runs > 50) throw new Error('--runs 는 1~50')
  if (!a.hosts.length || a.hosts.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) throw new Error('--hosts 는 1~5 의 쉼표 목록')
  if (!Number.isInteger(a.delay) || a.delay < 0 || a.delay > 60_000) throw new Error('--host-delay 는 0~60000')
  return a
}

function resolveClaude(given) {
  if (given) return given
  for (const d of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const f = path.join(d, 'claude')
    try {
      fs.accessSync(f, fs.constants.X_OK)
      // 로컬 run.sh 의 claude shim(I-8)은 모델 호출 0 을 위해 init 을 내지 않는다 — 진짜 CLI 를 써야 잴 수 있다
      if (fs.readFileSync(f, 'utf8').slice(0, 400).includes('pleiades')) continue
      return f
    } catch {
      // 다음
    }
  }
  throw new Error('claude 를 PATH 에서 찾지 못했다 — --claude=<경로>')
}

// 통합 층과 같은 모델 핀(fin 선언의 models) — 못 읽으면 별칭(오프라인이라 판정에 영향 없다)
function modelPin() {
  try {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps', 'finance', 'src', 'lib', 'ai', 'models.ts'), 'utf8')
    return (src.match(/sonnet:\s*['"]([^'"]+)['"]/) || [])[1] || 'sonnet'
  } catch {
    return 'sonnet'
  }
}

function childEnv(keepApi, delay, ignoreEof = false) {
  const env = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && CHILD_ENV_ALLOW.test(k)) env[k] = v
  Object.assign(env, { DISABLE_AUTOUPDATER: '1', ENABLE_TOOL_SEARCH: 'false' })
  if (!keepApi) env.ANTHROPIC_BASE_URL = CLOSED_API
  if (delay) env.PROBE_HOST_DELAY_MS = String(delay)
  if (ignoreEof) env.PROBE_HOST_IGNORE_EOF = '1'
  return env
}

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 한 회 — 호스트 k 개. 돌려주는 것: init 시간 · 서버별 상태 · 모델 응답 여부 · 고아 수 */
async function runOnce(claude, k, a) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stdio-probe-'))
  const work = path.join(tmp, 'work') // 빈 중립 cwd(통합 층과 같이 조상에 .claude 없음)
  const pids = path.join(tmp, 'pids')
  fs.mkdirSync(work)
  fs.mkdirSync(pids)
  const names = Array.from({ length: k }, (_, i) => `pl_probe${i + 1}`)
  const cfg = path.join(tmp, 'mcp.json')
  fs.writeFileSync(cfg, JSON.stringify({ mcpServers: Object.fromEntries(names.map((n) => [n, { type: 'stdio', command: process.execPath, args: [__filename, '--host', pids, n] }])) }))
  const args = [
    '--print', '--output-format', 'stream-json', '--verbose',
    '--model', modelPin(),
    '--system-prompt', '탐침이다. 답하지 않는다.',
    '--mcp-config', cfg, '--strict-mcp-config',
    '--setting-sources', 'project',
    '--allowedTools', names.map((n) => `mcp__${n}__ping`).join(','),
    '--tools', '',
    '--max-budget-usd', '1.0000',
    '--permission-mode', 'dontAsk',
    '--no-session-persistence', // 탐침만 — 사용자 CLI 설정 디렉터리에 세션 기록을 남기지 않는다
  ]
  const started = Date.now()
  const child = spawn(claude, args, { cwd: work, env: childEnv(a.keepApi, a.delay, a.ignoreEof), stdio: ['pipe', 'pipe', 'ignore'] })
  child.stdin.end('탐침 — 이 메시지에는 답하지 않는다.')
  const r = { initMs: null, status: {}, hooksBefore: 0, replied: false, orphans: 0, initSeen: 0 }
  await new Promise((resolve) => {
    let buf = ''
    const done = () => {
      clearTimeout(timer)
      child.kill('SIGKILL')
    }
    const timer = setTimeout(done, INIT_WAIT_MS)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (c) => {
      buf += c
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        let e
        try {
          e = JSON.parse(line)
        } catch {
          continue
        }
        if (e.type === 'system' && typeof e.subtype === 'string' && e.subtype.startsWith('hook_') && r.initMs === null) r.hooksBefore += 1
        if (e.type === 'assistant' || e.type === 'result') r.replied = true
        if (e.type === 'system' && e.subtype === 'init' && r.initMs === null) {
          r.initMs = Date.now() - started
          for (const m of Array.isArray(e.mcp_servers) ? e.mcp_servers : []) {
            if (m && names.includes(m.name)) r.status[m.name] = typeof m.status === 'string' && /^[a-z-]{1,20}$/.test(m.status) ? m.status : '?'
          }
          done() // init 첫 줄 — 바로 SIGKILL(모델 응답 전에 끊는다)
        }
      }
    })
    child.on('close', resolve)
  })
  // H-R4 — CLI 가 죽은 뒤 호스트가 스스로 끝나는가
  const hostPids = names.map((n) => {
    try {
      return Number(fs.readFileSync(path.join(pids, `${n}.pid`), 'utf8'))
    } catch {
      return null
    }
  }).filter((p) => Number.isInteger(p) && p > 0)
  r.initSeen = names.filter((n) => fs.existsSync(path.join(pids, `${n}.init`))).length
  r.spawned = hostPids.length
  const until = Date.now() + EOF_WAIT_MS
  while (Date.now() < until && hostPids.some(alive)) await sleep(50)
  const left = hostPids.filter(alive)
  r.orphans = left.length
  for (const p of left) {
    try {
      process.kill(p, 'SIGKILL') // 정리 — 판정에는 남는다
    } catch {
      // 이미 끝났다
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true })
  return r
}

const pct = (xs, q) => {
  if (!xs.length) return '-'
  const s = [...xs].sort((x, y) => x - y)
  return String(s[Math.min(s.length - 1, Math.floor(q * s.length))])
}

function cliVersion(claude) {
  try {
    const v = execFileSync(claude, ['--version'], { encoding: 'utf8', timeout: 10_000, env: childEnv(true, 0) }).trim()
    return /^[0-9][0-9A-Za-z .()_-]{0,60}$/.test(v) ? v : '?'
  } catch {
    return '?'
  }
}

async function main(argv) {
  const a = parseArgs(argv)
  const claude = resolveClaude(a.claude)
  const out = ['=== stdio 탐침 판정 양식 (#868 · 이 블록만 세션에 붙인다) ===']
  out.push(`CLI ${cliVersion(claude)} · node ${process.version} · ${a.keepApi ? 'API 주소 그대로(모델 호출 가능)' : 'API 주소 닫힌 포트(모델 호출 0)'} · 반복 ${a.runs} · 호스트 지연 ${a.delay} ms${a.ignoreEof ? ' · 양성 대조(호스트가 EOF 무시 — 측정 아님)' : ''}`)
  let pendingAny = 0
  let orphanAny = 0
  let repliedAny = 0
  let worstInit = 0
  for (const k of a.hosts) {
    const rs = []
    for (let i = 0; i < a.runs; i++) rs.push(await runOnce(claude, k, a))
    const got = rs.filter((r) => r.initMs !== null)
    const states = {}
    for (const r of got) for (const s of Object.values(r.status)) states[s] = (states[s] || 0) + 1
    const allOk = got.filter((r) => Object.keys(r.status).length === k && Object.values(r.status).every((s) => s === 'connected')).length
    const times = got.map((r) => r.initMs)
    const orphans = rs.reduce((n, r) => n + r.orphans, 0)
    const spawned = rs.reduce((n, r) => n + r.spawned, 0)
    const pending = states.pending || 0
    pendingAny += pending
    orphanAny += orphans
    repliedAny += rs.filter((r) => r.replied).length
    worstInit = Math.max(worstInit, ...times, 0)
    out.push(`호스트 ${k}: init 받음 ${got.length}/${rs.length} · 전부 connected ${allOk}/${got.length} · 상태 ${Object.entries(states).map(([s, n]) => `${s} ${n}`).join(' · ') || '없음'}`
      + ` · initialize 도달 ${rs.reduce((n, r) => n + r.initSeen, 0)}/${k * rs.length}`)
    out.push(`   init 첫 줄 p50 ${pct(times, 0.5)} ms · p90 ${pct(times, 0.9)} ms · 최대 ${times.length ? Math.max(...times) : '-'} ms · 고아(EOF ${EOF_WAIT_MS} ms 뒤 남음) ${orphans}/${spawned}`
      + ` · init 앞 hook ${rs.reduce((n, r) => n + r.hooksBefore, 0)}`)
  }
  out.push(`모델 응답: ${repliedAny ? `있음 ${repliedAny}회` : '없음'}`)
  const verdict = pendingAny === 0 && orphanAny === 0 ? 'stdio 조건 충족(pending 0 · EOF 종료) — init 최대 시간을 MCP 타임아웃과 대조한다' : `루프백 대안 검토(Q143 · H-R5) — pending ${pendingAny} · 고아 ${orphanAny}`
  out.push(`판정 재료: ${verdict} · init 최대 ${worstInit} ms`)
  out.push('미측정: pm2 max_memory_restart 가 자식 RSS 를 세는가(서버 pm2)')
  out.push('=== 끝 ===')
  process.stdout.write(`${out.join('\n')}\n`)
}

if (process.argv[2] === '--host') host(process.argv[3], process.argv[4])
else main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`탐침 중단: ${err && err.message ? err.message : err}\n`)
  process.exit(1)
})
