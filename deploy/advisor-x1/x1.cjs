#!/usr/bin/env node
// x1.cjs — 011 통합 어드바이저 실험 X1 (#632 · 설계 docs/specs/011-integrated-advisor.md §5 · 런북 docs/runbooks/advisor-x1.md).
//
// 사용(서버 · 사용자 · 반드시 run-x1.sh 를 거친다 — 배포 락을 쥔 채로만 돈다 · S-1):
//   bash ~/pleiades-advisor-x1/run-x1.sh                         본 실행
//   bash ~/pleiades-advisor-x1/run-x1.sh --preflight             사전 판정만(S-1~S-5 · Q131 스냅샷) — 모델 호출 0
//   bash ~/pleiades-advisor-x1/run-x1.sh --rerun=<budget|resume|prompt> [--max-budget=<usd>]   재실행(합쳐 최대 1회)
//
// 코드가 지키는 규칙(§5-3 S-1~S-6 · Q131):
//  - 질문은 사전 판정이 전부 통과한 뒤에만 시작한다. 하나라도 어긋나면 질문 0 으로 멈춘다
//  - 허용·거부 목록은 배포 체크아웃의 분류 상수에서 만든다(Q118) — 스크립트에 도구 이름 목록이 없다
//  - claude 는 인자 배열로 부른다(셸 없음) · 질문은 stdin 으로 넘긴다(ps 에 원문이 보이지 않게)
//  - pm2 · git 명령을 부르지 않는다 · 배포 락 파일을 열지 않는다(락은 run-x1.sh 가 쥔다)
//  - 판정 양식(stdout)에는 질문 번호 · 상태 · 비용 · 지연 · turns · 도구 수 · 판정만 — 원문 · 값 · 경로 · ID · URL 없음
//  - 원문(질문 · 답 · CLI 출력)은 ~/pleiades-private/advisor-x1/ 아래 600 파일에만
'use strict'

const crypto = require('crypto'), fs = require('fs'), http = require('http'), os = require('os'), path = require('path')
const { spawn, spawnSync } = require('child_process')
// 순수 판정 함수(소스 분류 상수 · stream-json · init) — 같은 디렉터리에 커밋 고정으로 함께 설치한다(런북 1절)
const { Stop, stop, safeName, finLists, fitLists, parseStream, judgeInit, judgeAnswer } = require('./judge.cjs')

const TEST = process.env.PLEIADES_TEST === '1'
const HOME = os.homedir()
const MIN = 60000

const CONFIG = {
  // Q130 — 호출당 상한 = fin 크론 값 $1.0(apps/finance/src/bot/notifications/briefing.ts:91 · active-review.ts:146 ·
  // bot/commands/briefing.ts:114 · lib/report/ai-review.ts:62 — 넷 다 maxBudgetUsd: 1.0). 크론 값이 바뀌면 이 줄도 고친다
  budgetUsd: 1.0,
  rerunBudgetMaxUsd: 2.0, // --rerun=budget 이 올릴 수 있는 상한(§5-6 (a))
  targetUsd: 3.0, // §5-5 실행 1회 목표 총액 — 누적이 닿으면 다음 질문을 시작하지 않는다(상한 아님)
  questionTimeoutMs: TEST && process.env.X1_Q_TIMEOUT_MS ? Number(process.env.X1_Q_TIMEOUT_MS) : 10 * MIN,
  // 런북 release-inplace.md C0 — 두 앱 크론이 비는 00:15~05:55(KST) · 매월 1일 · 1·4·7·10월 7일은 피한다
  windowStart: '00:15',
  lastStart: '05:40', // 질문 상한 10분이 05:55 전에 끝나게
  httpMs: 10000, cliMs: 30000, dbMs: 120000, probeMs: TEST && process.env.X1_PROBE_TIMEOUT_MS ? Number(process.env.X1_PROBE_TIMEOUT_MS) : 30000,
  logTailBytes: 16 * 1048576, questionMaxChars: 4000, knowledgeMaxBytes: 20000,
}

// 판정에 쓰는 CLI 옵션(서버 CLI 2.1.308 사전 측정 · #632) — help 에 없으면 멈춘다
const REQUIRED_OPTIONS = [
  '--print', '--output-format', '--verbose', '--model', '--system-prompt', '--mcp-config', '--strict-mcp-config',
  '--setting-sources', '--allowedTools', '--disallowedTools', '--tools', '--max-budget-usd', '--permission-mode',
  '--no-session-persistence',
]

const APPS = {
  fin: {
    dir: path.join(HOME, 'pleiades-fin', 'apps', 'finance'),
    serverKey: 'myfinance', // I-4 — 도구 접두 mcp__myfinance__
    tools: 'src/lib/ai/advisor-tools.ts',
    models: 'src/lib/ai/models.ts', pins: 'PINNED_MODELS', client: 'pkg',
    // Q131 원장 테이블 — WRITE_TOOLS 의 도구가 바꾸는 모델(src/mcp/tools/*.ts · lib/trade-service.ts · lib/rsu-vest-service.ts).
    // 캐시는 뺀다(PriceCache · EarningsCache · KrxStock · BenchmarkPrice · 스냅샷 — 읽기 도구·크론도 쓴다 · 011 §3-1)
    ledger: ['HoldingStrategy', 'Watchlist', 'Transaction', 'Category', 'Asset', 'Deposit', 'Budget', 'RecurringTransaction',
      'AlertConfig', 'RSUSchedule', 'StockOption', 'StockOptionVesting', 'CustomStrategy', 'Holding', 'Trade'],
  },
  fit: {
    dir: path.join(HOME, 'pleiades-fit', 'apps', 'fitness'),
    serverKey: 'myfitness',
    tools: 'src/lib/ai/advisor-tools.ts',
    models: 'src/lib/ai/models.ts', pins: 'PINNED_CLAUDE_MODELS', client: 'src/generated/prisma/client.ts', // schema.prisma generator output
    // generate_training_plan(ADVISOR_EXCLUDED_TOOLS)이 쓰는 모델(src/mcp/tools/training-plan.ts:302,326,348)
    ledger: ['TrainingPlan', 'TrainingWorkout'],
  },
}
const CHECKOUTS = [path.join(HOME, 'pleiades-fin'), path.join(HOME, 'pleiades-fit')]
const PRIVATE = process.env.PLEIADES_PRIVATE_DIR || path.join(HOME, 'pleiades-private') // release-inplace.sh 와 같은 규칙
const X1_DIR = path.join(PRIVATE, 'advisor-x1')
const PM2_LOGS = path.join(process.env.PM2_HOME || path.join(HOME, '.pm2'), 'logs')
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude')
const MANAGED_DIR = TEST && process.env.X1_MANAGED_DIR ? process.env.X1_MANAGED_DIR : '/etc/claude-code'
const MCP_MSGS = new Set(['tool_call', 'tool_call_reported_error', 'tool_call_failed', 'tool_call_sdk_error']) // 011 §5-8 I-2
const QUESTION_IDS = ['X1', 'X2', 'X3', 'X4', 'D1', 'D2'] // 교차 먼저(§5-4) · D1 = fin 대조 · D2 = fit 대조
const CROSS = QUESTION_IDS.slice(0, 4)
const KIND = { X1: '교차', X2: '교차', X3: '교차', X4: '교차', D1: '대조(fin)', D2: '대조(fit)' }

// Q119 — 새 짧은 프롬프트. 앱 SYSTEM_PROMPT · 하네스 지식은 싣지 않는다(§3-3 W3) — 재실행 prompt 만 K2 지식을 덧붙인다
const SYSTEM_PROMPT = `너는 한 사용자의 개인 재무(myfinance 도구)와 건강·운동(myfitness 도구) 데이터를 함께 보는 어드바이저다.
- 쓸 수 있는 것은 두 도메인의 읽기 도구뿐이다. 데이터를 바꾸는 요청에는 할 수 없다고 답한다.
- 질문이 두 도메인에 걸리면 양쪽 도구로 데이터를 확인한 뒤 둘을 연결해서 답한다.
- 도구로 확인하지 않은 수치는 말하지 않는다. 확인하지 못한 것은 확인하지 못했다고 쓴다.
- 한국어로, 결론을 먼저, 간결하게 답한다.`

// ── 공통 ─────────────────────────────────────────────────────────────
const nowDate = () => (TEST && process.env.X1_NOW ? new Date(process.env.X1_NOW) : new Date())
const kstParts = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, stamp: `${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`,
    month: +p.month, day: +p.day }
}
const usd = (v) => (typeof v === 'number' && Number.isFinite(v) ? `$${v.toFixed(2)}` : '$?')
const sec = (ms) => (typeof ms === 'number' ? `${(ms / 1000).toFixed(1)}s` : '?')
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const errCode = (e) => (safeName(e && e.code) !== '?' ? e.code : 'error')
const readText = (file) => fs.readFileSync(file, 'utf8')

const writePrivate = (file, body) => { fs.writeFileSync(file, body, { mode: 0o600 }); fs.chmodSync(file, 0o600) }
// 있으면 권한만 검사(바꾸지 않는다) · 없으면 700 으로 만든다(umask 077)
function ensurePrivateDir(dir) {
  if (!fs.existsSync(dir)) return void fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  if ((fs.statSync(dir).mode & 0o077) !== 0) stop('입력: 비공개 디렉터리 권한이 700 이 아니다')
}

// 체크아웃(git 작업 트리) 밖인가 — 조상에 .git 이 있으면 안이다(Q115 · I-9)
function insideGit(p) {
  for (let d = fs.realpathSync(p); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return true
    if (path.dirname(d) === d) return false
  }
}

// ── S-1 · 시각 ───────────────────────────────────────────────────────
function checkWindow(d) {
  const k = kstParts(d)
  if (k.day === 1) return '매월 1일(월간 크론)'
  if (k.day === 7 && [1, 4, 7, 10].includes(k.month)) return '분기 크론일'
  if (k.hm < CONFIG.windowStart || k.hm >= CONFIG.lastStart) return `크론 창 밖(${CONFIG.windowStart}~${CONFIG.lastStart} KST 에만 시작)`
  return null
}

// ── 입력 파일 ────────────────────────────────────────────────────────
function privateFile(file, label) {
  let st
  try { st = fs.statSync(file) } catch { stop(`입력: ${label} 없음`) }
  if ((st.mode & 0o077) !== 0) stop(`입력: ${label} 권한이 600 이 아니다`)
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) stop(`입력: ${label} 소유자가 실행 계정이 아니다`)
  return readText(file)
}

function parseQuestions(text) {
  const out = {}; let cur = null
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^## (\S+)\s*$/)
    if (m) {
      if (!QUESTION_IDS.includes(m[1]) || out[m[1]] !== undefined) stop(`입력: 질문 머리 형식 오류(## X1~X4 · D1 · D2 를 한 번씩)`)
      out[(cur = m[1])] = []
    } else if (cur) out[cur].push(line)
    else if (line.trim()) stop('입력: 첫 질문 머리(## X1) 앞에 글이 있다')
  }
  for (const id of QUESTION_IDS) {
    const body = (out[id] || []).join('\n').trim()
    if (!body) stop(`입력: ${id} 질문이 없다`)
    if (body.length > CONFIG.questionMaxChars) stop(`입력: ${id} 질문이 ${CONFIG.questionMaxChars}자를 넘는다`)
    out[id] = body
  }
  return out
}

// ── S-3 settings ─────────────────────────────────────────────────────
function judgeSettingsFile(scope, file) {
  if (!fs.existsSync(file)) return { scope, present: false }
  let j
  try { j = JSON.parse(readText(file)) } catch { return { scope, present: true, parseFail: true } }
  const allow = Array.isArray(j?.permissions?.allow) ? j.permissions.allow.filter((x) => typeof x === 'string') : []
  const hooks = j && typeof j.hooks === 'object' && j.hooks !== null && Object.keys(j.hooks).length > 0
  const plugins = j && typeof j.enabledPlugins === 'object' && j.enabledPlugins !== null
    && Object.values(j.enabledPlugins).some((v) => v === true)
  return { scope, present: true, mcp: allow.filter((x) => x.startsWith('mcp__')).length, wild: allow.filter((x) => x.includes('*')).length,
    other: allow.filter((x) => !x.startsWith('mcp__') && !x.includes('*')).length, hooks, plugins, mode: j?.permissions?.defaultMode }
}

function settingsScopes(cwd) {
  const rows = [
    judgeSettingsFile('user', path.join(CLAUDE_DIR, 'settings.json')),
    judgeSettingsFile('user-local', path.join(CLAUDE_DIR, 'settings.local.json')),
    judgeSettingsFile('관리형 파일', path.join(MANAGED_DIR, 'managed-settings.json')),
  ]
  const fragDir = path.join(MANAGED_DIR, 'managed-settings.d')
  let frags = []
  try { frags = fs.readdirSync(fragDir).filter((f) => f.endsWith('.json')).sort() } catch { /* 없음 */ }
  for (const f of frags) rows.push(judgeSettingsFile('관리형 조각', path.join(fragDir, f)))
  // project · local 범위 — 실행 cwd(빈 임시 디렉터리)와 그 조상의 .claude/settings*.json
  for (let d = cwd; ; d = path.dirname(d)) {
    for (const f of ['settings.json', 'settings.local.json']) {
      const r = judgeSettingsFile('project(조상)', path.join(d, '.claude', f))
      if (r.present && path.join(d, '.claude') !== path.resolve(CLAUDE_DIR)) rows.push(r)
    }
    if (path.dirname(d) === d) break
  }
  return { rows, frags: frags.length }
}

function checkSettings(cwd, form) {
  const { rows, frags } = settingsScopes(cwd)
  // #634 — user 범위 플러그인은 보고만(--setting-sources project 라 읽지 않는다 · 실제 로드는 질문마다 init 판정이 본다)
  const userScope = (r) => r.scope === 'user' || r.scope === 'user-local'
  const bad = rows.filter((r) => r.present && (r.parseFail || r.mcp || r.wild || r.hooks || (r.plugins && !userScope(r))))
  const show = (r) => (!r.present ? `${r.scope} 없음` : r.parseFail ? `${r.scope} 읽기 실패`
    : `${r.scope} allow mcp ${r.mcp} · 와일드카드 ${r.wild} · 기타 ${r.other} · hooks ${r.hooks ? '있음' : '없음'}${r.plugins ? ` · 플러그인 켬${userScope(r) ? '(보고만)' : ''}` : ''}${r.mode !== undefined ? ` · defaultMode ${safeName(String(r.mode))}` : ''}`)
  const base = rows.filter((r) => r.scope !== '관리형 조각' && r.scope !== 'project(조상)').map(show)
  const extra = rows.filter((r) => r.scope === '관리형 조각' || r.scope === 'project(조상)').map(show)
  const memo = ['CLAUDE.md', 'rules'].map((f) => `~/.claude/${f} ${fs.existsSync(path.join(CLAUDE_DIR, f)) ? '있음' : '없음'}`)
    .concat(`관리형 managed-mcp.json ${fs.existsSync(path.join(MANAGED_DIR, 'managed-mcp.json')) ? '있음' : '없음'}(보고만)`)
  form.push(`S-3 settings: ${base.join(' | ')} | 관리형 조각 ${frags}개${extra.length ? ` (${extra.join(' | ')})` : ''} | ${memo.join(' · ')} | 실행 범위 --setting-sources project + 빈 임시 cwd`)
  if (bad.length) stop(`S-3: 막는 항목 ${bad.length}(${[...new Set(bad.map((r) => r.scope))].join(' · ')}) — 실행 안 함`)
  // 탐침 기록에 남길 user 범위 지문(내용은 남기지 않는다) — 탐침 뒤 user 설정이 바뀌었는지 양식에 같음/다름(#634 재리뷰 major 1)
  return sha(['settings.json', 'settings.local.json'].map((f) => { try { return readText(path.join(CLAUDE_DIR, f)) } catch { return '-' } }).join('\0'))
}

// ── S-5 도구 목록(Q118 · 배포 체크아웃 소스에서) ────────────────────
function sourceLists() {
  const out = {}
  for (const [app, a] of Object.entries(APPS)) {
    let src; try { src = readText(path.join(a.dir, a.tools)) } catch { stop(`S-5: ${app} 분류 소스 없음`) }
    const l = app === 'fin' ? finLists(src) : fitLists(src)
    const pre = `mcp__${a.serverKey}__`
    if (app === 'fin' && l.prefix !== pre) stop(`S-5: fin 도구 접두가 mcp-config 서버 키(${a.serverKey})와 다르다(I-4)`)
    for (const n of [...l.read, ...l.write]) if (!n.startsWith(pre) || safeName(n) !== n) stop(`S-5: ${app} 분류 목록에 접두·형식이 다른 항목`)
    if (!l.read.length) stop(`S-5: ${app} 읽기 목록이 비었다`)
    if (l.read.some((n) => l.write.includes(n))) stop(`S-5: ${app} 읽기·쓰기 목록이 겹친다`)
    out[app] = { ...l, pre }
  }
  return out
}

function compareRegistered(app, l, registered) {
  const strip = (n) => n.slice(l.pre.length)
  const listed = new Set([...l.read, ...l.write].map(strip))
  const reg = new Set(registered)
  const missing = [...reg].filter((n) => !listed.has(n)).length // 등록됐는데 분류 없음
  const extra = [...listed].filter((n) => !reg.has(n)).length // 분류에 있는데 등록 없음
  return { missing, extra, n: reg.size }
}

// ── S-4 모델 핀 ──────────────────────────────────────────────────────
function pins() {
  const got = {}
  for (const [app, a] of Object.entries(APPS)) {
    let src; try { src = readText(path.join(a.dir, a.models)) } catch { stop(`S-4: ${app} models.ts 없음`) }
    const b = src.slice(src.indexOf(a.pins))
    const h = (b.match(/haiku:\s*['"]([^'"]+)['"]/) || [])[1]
    const s = (b.match(/sonnet:\s*['"]([^'"]+)['"]/) || [])[1]
    if (src.indexOf(a.pins) < 0 || !h || !s) stop(`S-4: ${app} 모델 핀을 찾지 못했다`)
    got[app] = { haiku: h, sonnet: s }
  }
  if (got.fin.haiku !== got.fit.haiku || got.fin.sonnet !== got.fit.sonnet) stop('S-4: 두 앱 모델 핀이 다르다 — 실행 안 함')
  return got.fin
}

function childEnv(pin) {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (/^(DATABASE_URL|DISCORD_[A-Z0-9_]*|ANTHROPIC_MODEL|X1_LOCK_[A-Z_]+)$/.test(k)) delete env[k]
  return { ...env, DISABLE_AUTOUPDATER: '1', ANTHROPIC_DEFAULT_HAIKU_MODEL: pin.haiku, ANTHROPIC_DEFAULT_SONNET_MODEL: pin.sonnet,
    ANTHROPIC_SMALL_FAST_MODEL: pin.haiku, ENABLE_TOOL_SEARCH: 'false' } // 앱과 같은 핀 세 키 + 자동 업데이트 끔(S-4) + MCP 도구 검색 끔(ToolSearch tool_use 가 J2 거짓 실패 · #632 9-1 major 2)
}

function cliVersion(bin, env) {
  const r = spawnSync(bin, ['--version'], { env, encoding: 'utf8', timeout: CONFIG.cliMs, stdio: ['ignore', 'pipe', 'ignore'] })
  return r.status === 0 ? ((r.stdout || '').match(/\d+\.\d+\.\d+/) || [])[0] || null : null
}

function resolveClaude(arg) {
  if (arg) return path.isAbsolute(arg) && fs.existsSync(arg) ? arg : stop('CLI: --claude-bin 은 있는 절대 경로')
  for (const d of (process.env.PATH || '').split(':').filter(Boolean).concat(path.join(HOME, '.local', 'bin'))) {
    const f = path.join(d, 'claude')
    try { fs.accessSync(f, fs.constants.X_OK); return f } catch { /* 다음 */ }
  }
  return stop('CLI: claude 를 찾지 못했다')
}

// ── MCP tools/list ───────────────────────────────────────────────────
function post(url, body, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: body === null ? 'DELETE' : 'POST', timeout: CONFIG.httpMs, headers: {
      'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers } }, (res) => {
      let s = ''; res.setEncoding('utf8')
      res.on('data', (c) => { s += c })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: s }))
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.end(body === null ? undefined : JSON.stringify(body))
  })
}

function rpcResult(res, id) {
  const msgs = /text\/event-stream/.test(res.headers['content-type'] || '')
    ? res.text.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => { try { return JSON.parse(l.slice(5)) } catch { return null } })
    : [(() => { try { return JSON.parse(res.text) } catch { return null } })()]
  const m = msgs.find((x) => x && x.id === id)
  if (res.status !== 200 || !m || !m.result) throw new Error('rpc')
  return m.result
}

async function listTools(url) {
  const init = await post(url, { jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'pleiades-x1', version: '1' } } }, {})
  const r = rpcResult(init, 1)
  const sid = init.headers['mcp-session-id']
  const h = { ...(sid ? { 'mcp-session-id': sid } : {}), ...(r.protocolVersion ? { 'mcp-protocol-version': r.protocolVersion } : {}) }
  await post(url, { jsonrpc: '2.0', method: 'notifications/initialized' }, h)
  const names = []; let cursor
  for (let id = 2; id < 50; id++) {
    const res = rpcResult(await post(url, { jsonrpc: '2.0', id, method: 'tools/list', params: cursor ? { cursor } : {} }, h), id)
    for (const t of res.tools || []) names.push(String(t.name))
    if (!(cursor = res.nextCursor)) break
  }
  if (sid) await post(url, null, h).catch(() => {}) // 세션 닫기(무활동 30분 정리를 기다리지 않는다)
  return names
}

// .env 에서 키 하나(값은 출력하지 않는다) — deploy/pleiades.config.cjs parseDotenv 와 같은 규칙
function dotenvKey(file, key) {
  const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/
  let v
  for (const raw of readText(file).split(/\r?\n/)) {
    const m = raw.match(LINE)
    if (!m || raw.trimStart().startsWith('#') || m[1] !== key) continue
    v = m[2].length >= 2 && m[2][0] === m[2][m[2].length - 1] && `'"`.includes(m[2][0]) ? m[2].slice(1, -1) : m[2]
  }
  return v
}

async function checkTools(form) {
  const lists = sourceLists()
  const urls = {}, parts = []
  for (const [app, a] of Object.entries(APPS)) {
    let port
    try { port = dotenvKey(path.join(a.dir, '.env'), 'MCP_PORT') } catch { stop(`S-5: ${app} .env 없음`) }
    if (!/^[1-9][0-9]{0,4}$/.test(port || '')) stop(`S-5: ${app} .env 에 MCP_PORT 가 없다(서버에서 확인)`)
    let cfgPort
    try { cfgPort = new URL(JSON.parse(readText(path.join(a.dir, 'src/lib/ai/mcp-config.json'))).mcpServers[a.serverKey].url).port } catch {
      stop(`S-5: ${app} mcp-config.json 에 서버 키 ${a.serverKey} 가 없다(I-4)`)
    }
    const same = cfgPort === port
    if (app === 'fin' && !same) stop('S-5: fin MCP_PORT ≠ mcp-config 포트(deploy.sh 가 거부하는 상태)')
    urls[app] = `http://127.0.0.1:${port}/mcp`
    let registered
    try { registered = await listTools(urls[app]) } catch { stop(`S-5: ${app} MCP tools/list 실패`) }
    const l = lists[app]
    const c = compareRegistered(app, l, registered)
    parts.push(`${app} 등록 ${c.n} = 읽기 ${l.read.length} + 쓰기 ${l.write.length}${l.dropped ? ` (MCP 아닌 항목 ${l.dropped} 버림)` : ''} · 차이 ${c.missing + c.extra}`
      + ` · 포트 ${app === 'fin' ? 'mcp-config 와' : '기본값과'} ${same ? '같음' : '다름'}`)
    if (c.missing || c.extra) {
      form.push(`S-5 도구: ${parts.join(' | ')}`)
      stop(`S-5: ${app} 등록 ↔ 분류 차이(분류 없음 ${c.missing} · 등록 없음 ${c.extra}) — 질문 0`)
    }
  }
  form.push(`S-5 도구: ${parts.join(' | ')} | 서버 키 ${APPS.fin.serverKey} · ${APPS.fit.serverKey}`)
  const allow = [...lists.fin.read, ...lists.fit.read]
  const deny = [...lists.fin.write, ...lists.fit.write]
  return { allow, deny, urls, pre: { fin: lists.fin.pre, fit: lists.fit.pre } }
}

// ── Q131 원장 스냅샷(앱 cwd 의 .env · Prisma SELECT · URL 출력 없음) ──
// ESM 한 벌 — fin 은 node 로(.mjs · @prisma/client = prisma-client-js 생성기) · fit 은 앱 tsx 로(.mts · prisma-client 생성기가
// TS 로 src/generated/prisma/client.ts 에 만든다 — @prisma/client 에는 fit 모델이 없다 · 회귀: PR #633 Codex P1)
const DB_HELPER = `
import fs from 'fs'; import crypto from 'crypto'; import path from 'path'; import { createRequire } from 'module'; import { pathToFileURL } from 'url'
const LINE = /^\\s*(?:export\\s+)?([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.*?)\\s*$/
for (const raw of fs.readFileSync('.env', 'utf8').split(/\\r?\\n/)) {
  const m = raw.match(LINE); if (!m || raw.trimStart().startsWith('#') || m[1] !== 'DATABASE_URL') continue
  process.env.DATABASE_URL = m[2].length >= 2 && m[2][0] === m[2][m[2].length - 1] && "'\\"".includes(m[2][0]) ? m[2].slice(1, -1) : m[2]
}
const canon = (v) => v === null || typeof v !== 'object' ? (typeof v === 'bigint' ? v.toString() : v)
  : v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(canon)
  : typeof v.toJSON === 'function' ? v.toJSON() : Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
let p
const out = (o) => process.stdout.write(JSON.stringify(o))
;(async () => {
  const c = process.env.X1_CLIENT
  const { PrismaClient } = c === 'pkg' ? createRequire(path.join(process.cwd(), 'x1.js'))('@prisma/client') : await import(pathToFileURL(c).href)
  p = new PrismaClient()
  const tables = {}
  for (const t of JSON.parse(process.env.X1_TABLES)) {
    const d = p[t[0].toLowerCase() + t.slice(1)]
    if (!d || typeof d.findMany !== 'function') return out({ ok: false, code: 'no-model' })
    const rows = await d.findMany()
    let latest = null
    for (const r of rows) for (const k of ['updatedAt', 'createdAt']) if (r[k] instanceof Date && (latest === null || r[k].getTime() > latest)) latest = r[k].getTime()
    const lines = rows.map((r) => JSON.stringify(canon(r))).sort()
    tables[t] = { n: rows.length, latest, digest: crypto.createHash('sha256').update(lines.join('\\n')).digest('hex') }
  }
  out({ ok: true, tables })
})().catch((e) => out({ ok: false, code: (e && e.constructor && e.constructor.name) || 'error' })).finally(() => p && p.$disconnect && p.$disconnect())
`

function dbSnapshot(app) {
  const a = APPS[app]
  const schema = (() => { try { return readText(path.join(a.dir, 'prisma', 'schema.prisma')) } catch { return '' } })()
  for (const t of a.ledger) if (!new RegExp(`^model ${t} \\{`, 'm').test(schema)) stop(`Q131: ${app} 스키마에 원장 모델이 없다(스크립트 갱신 필요)`)
  const tsx = path.join(a.dir, 'node_modules', '.bin', 'tsx') // deploy.sh 1단계 앱 npm ci 가 devDependencies 까지 설치한다
  if (a.client !== 'pkg' && !fs.existsSync(tsx)) stop(`Q131: ${app} tsx 없음(생성 클라이언트를 읽지 못한다)`)
  const helper = path.join(X1_DIR, `db-helper-${app}.${a.client === 'pkg' ? 'mjs' : 'mts'}`)
  writePrivate(helper, DB_HELPER)
  const env = { ...process.env, X1_TABLES: JSON.stringify(a.ledger), X1_CLIENT: a.client === 'pkg' ? 'pkg' : path.join(a.dir, a.client),
    PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ''}` } // tsx 셔뱅(/usr/bin/env node)이 같은 node 를 찾게
  delete env.DATABASE_URL
  const [cmd, argv] = a.client === 'pkg' ? [process.execPath, [helper]] : [tsx, [helper]]
  const r = spawnSync(cmd, argv, { cwd: a.dir, env, encoding: 'utf8', timeout: CONFIG.dbMs, stdio: ['ignore', 'pipe', 'ignore'] })
  let j
  try { j = JSON.parse(r.stdout) } catch { j = { ok: false, code: r.error ? 'spawn' : 'output' } }
  if (!j.ok) stop(`Q131: ${app} DB 조회 실패(${safeName(j.code)})`)
  return j.tables
}

function dbDiff(before, after) {
  let diff = 0, total = 0
  for (const app of Object.keys(before)) for (const t of Object.keys(before[app])) {
    total++
    const b = before[app][t], a = after[app] && after[app][t]
    if (!a || a.n !== b.n || a.latest !== b.latest || a.digest !== b.digest) diff++
  }
  return { diff, total }
}

// ── 실행 ─────────────────────────────────────────────────────────────
function cliArgs(model, system, mcpConfig, lists, budget) {
  return ['--print', '--output-format', 'stream-json', '--verbose', '--model', model, '--system-prompt', system,
    '--mcp-config', mcpConfig, '--strict-mcp-config', '--setting-sources', 'project',
    '--allowedTools', lists.allow.join(','), '--disallowedTools', lists.deny.join(','),
    '--tools', '', // 내장·Web 도구 끔(MCP 는 남는다 · §5-8 I-7)
    '--max-budget-usd', String(budget), '--permission-mode', 'dontAsk', '--no-session-persistence']
}

// #634 — 첫 줄(init)을 받자마자 판정한다. 어긋나면 첫 tool_use 를 기다리지 않고 SIGKILL(fail-closed).
// probe(사전 판정의 init 탐침)는 판정이 나면 결과와 무관하게 SIGKILL — 모델 응답 전에 끊으려는 것이다
function askOnce(bin, args, env, cwd, prompt, rawFile, checkInit, probe = false) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const child = spawn(bin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = '', err = '', timedOut = false, init = null, replied = false
    const kill = (sig = 'SIGKILL') => { child.kill(sig); setTimeout(() => child.kill('SIGKILL'), 5000).unref() }
    const judge = (line) => {
      let e = null
      try { e = JSON.parse(line) } catch { /* init 아님 → 형식 */ }
      if (e && e.type === 'assistant') replied = true
      if (!(init = checkInit(e)).ok || probe) kill()
    }
    const timer = setTimeout(() => { timedOut = true; kill('SIGTERM') }, probe ? CONFIG.probeMs : CONFIG.questionTimeoutMs)
    child.stdout.on('data', (c) => {
      out += c
      if (!init && out.includes('\n')) judge(out.slice(0, out.indexOf('\n'))) // 첫 줄이 여러 청크로 와도 줄이 끝나야 판정
    })
    child.stderr.on('data', (c) => { if (err.length < 65536) err += c })
    child.on('error', () => {}); child.stdin.on('error', () => {})
    child.stdin.end(prompt)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (!init) judge(out.split('\n')[0])
      replied = replied || out.split('\n').some((l) => l.startsWith('{"type":"assistant"'))
      writePrivate(rawFile, `${out}\n--- stderr ---\n${err}`)
      resolve({ out, code, timedOut, init, replied, ms: Date.now() - t0 })
    })
  })
}

// ── S-2 보조 판정(공유 로그) ─────────────────────────────────────────
function tail(file) {
  try {
    const st = fs.statSync(file), fd = fs.openSync(file, 'r')
    try {
      const len = Math.min(st.size, CONFIG.logTailBytes)
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, st.size - len)
      return buf.toString('utf8')
    } finally { fs.closeSync(fd) }
  } catch { return null }
}

function mcpLogScan(app, allow, pre, t0, t1, rd) {
  const dates = new Set([kstParts(new Date(t0)).date, kstParts(new Date(t1)).date])
  let files = 0, records = 0, outside = 0
  for (const d of dates) {
    const file = path.join(APPS[app].dir, 'logs', `mcp-${d}.log`)
    const text = tail(file)
    if (text === null) { if (fs.existsSync(file)) rd.fail++; continue } // 있는데 못 읽음 = 판정 불가(PR #643 Codex P2)
    files++
    for (const line of text.split('\n')) {
      if (!line.startsWith('{')) continue
      let j
      try { j = JSON.parse(line) } catch { continue }
      const at = Date.parse(j.time)
      if (!MCP_MSGS.has(j.msg) || !(at >= t0 - 1000 && at <= t1 + 5000)) continue
      records++
      if (typeof j.tool !== 'string' || !allow.has(pre + j.tool)) outside++ // 이름 없음(unknown)도 밖으로 센다
    }
  }
  return { files, records, outside }
}

// pm2 로그 줄 접두는 서버 로컬 시각(deploy/pleiades.config.cjs log_date_format) — 앞뒤 2분 여유
// rd.fail — 매칭 파일을 읽지 못한 수. 읽기 실패를 빈 로그(0 건)로 읽지 않는다(회귀: PR #643 Codex P2)
function pm2Count(app, roles, re, t0, t1, rd) {
  let n = 0
  let names = []
  try { names = fs.readdirSync(PM2_LOGS) } catch { return null }
  const NAME = new RegExp(`^pleiades-${app}-(${roles.join('|')})-(out|error)(?:-\\d+)?\\.log$`)
  const files = names.filter((x) => NAME.test(x))
  if (!files.length) return null // 회귀: #632 9-1 major 3 — 대상 로그 0개를 0 건(통과)으로 읽지 않는다
  for (const f of files) {
    const text = tail(path.join(PM2_LOGS, f))
    if (text === null) { rd.fail++; return null }
    for (const line of text.split('\n')) {
      const m = line.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}): /)
      if (!m || !re.test(line)) continue
      const at = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
      if (at >= t0 - 2 * MIN && at <= t1 + 2 * MIN) n++
    }
  }
  return n
}

function sharedLogs(lists, t0, t1, sessionCounts) {
  const allow = new Set(lists.allow)
  const rd = { fail: 0 }
  const fin = mcpLogScan('fin', allow, lists.pre.fin, t0, t1, rd)
  const fit = mcpLogScan('fit', allow, lists.pre.fit, t0, t1, rd)
  const nested = pm2Count('fin', ['mcp'], /caller=strategy:parse\b/, t0, t1, rd)
  const finChat = pm2Count('fin', ['bot'], /caller=bot:ai_chat\b/, t0, t1, rd)
  const fitChat = pm2Count('fit', ['bot'], /\[askAdvisor\] channel=/, t0, t1, rd)
  const mixed = (finChat || 0) > 0
  const missing = (sessionCounts.fin && !fin.files) || (sessionCounts.fit && !fit.files) || nested === null || finChat === null
  // 순서: 섞이지 않은 실패 → 근거 없음(섞여도 중첩 근거가 없으면 통과로 보지 않는다 · PR #633 Codex P2) → 섞임 → 통과
  const verdict = !mixed && (fin.outside || fit.outside || nested > 0) ? '실패'
    : rd.fail ? '판정 불가(로그 읽기 실패)' : missing ? '판정 불가(로그 없음)' : mixed ? '섞임' : '통과'
  return { fin, fit, nested, finChat, fitChat, mixed, verdict }
}

// ── 상태(재실행 합쳐 최대 1회 · §5-5) ────────────────────────────────
const STATE = () => path.join(X1_DIR, 'state.json')
function loadState() {
  try { return JSON.parse(readText(STATE())) } catch (e) {
    if (e.code === 'ENOENT') return { runs: [] }
    return stop('상태: state.json 을 읽지 못했다(손으로 고치지 않는다 — 런북 6절)')
  }
}

const counted = (state) => state.runs.filter((r) => r.counted !== false)
function planRun(args, state, qhash) {
  const main = counted(state).find((r) => r.kind === 'main')
  if (!args.rerun) {
    if (main) stop('재실행: 본 실행은 이미 있다 — 재실행은 --rerun=<budget|resume|prompt>')
    return { kind: 'main', ids: QUESTION_IDS, budget: CONFIG.budgetUsd }
  }
  if (!main) stop('재실행: 본 실행 기록이 없다')
  if (counted(state).length >= 2) stop('재실행: 이미 1회 했다(합쳐 최대 1회 · §5-5)')
  if (main.j2 !== '통과') stop('재실행: 본 실행 J2 가 통과가 아니다 — 원인 조사 먼저(§5-6)')
  if (main.qhash !== qhash) stop('재실행: 질문 파일이 본 실행과 다르다')
  const st = main.status || {}
  if (args.maxBudget !== undefined && args.rerun !== 'budget') stop('재실행: --max-budget 은 --rerun=budget 에만')
  if (args.rerun === 'budget') {
    if (!(args.maxBudget > CONFIG.budgetUsd && args.maxBudget <= CONFIG.rerunBudgetMaxUsd)) stop(`재실행: --max-budget 은 ${CONFIG.budgetUsd} 초과 ${CONFIG.rerunBudgetMaxUsd} 이하`)
    const ids = CROSS.filter((id) => ['판정 불가', '오류', '미실행'].includes(st[id]))
    if (!ids.some((id) => st[id] !== '미실행')) stop('재실행: 판정 불가 교차 질문이 없다 — budget 이 아니다')
    return { kind: 'budget', ids, budget: args.maxBudget }
  }
  if (args.rerun === 'resume') {
    const ids = CROSS.filter((id) => st[id] === '미실행')
    if (!ids.length) stop('재실행: 미실행 교차 질문이 없다')
    return { kind: 'resume', ids, budget: CONFIG.budgetUsd }
  }
  return { kind: 'prompt', ids: CROSS, budget: CONFIG.budgetUsd }
}

// ── 판정 양식 ────────────────────────────────────────────────────────
function questionLine(id, q, cum) {
  if (q.status === '미실행') return `${id} ${KIND[id]} · 미실행(${q.reason}) · 누적 ${usd(cum)}`
  return `${id} ${KIND[id]} · ${q.status}${q.code ? `(${q.code})` : ''} · ${usd(q.cost)} · ${sec(q.ms)} · turns ${q.turns ?? '?'}`
    + ` · fin ${q.fin.n}(성공 ${q.fin.ok}) · fit ${q.fit.n}(성공 ${q.fit.ok}) · 목록 밖 ${q.outside}${q.outside ? ` [${q.outsideNames.join(',')}]` : ''}`
    + ` · init ${q.init.ok ? '통과' : `${q.init.kind === 'violation' ? '위반' : '형식'}(${q.init.why})`}${initCounts(q.init)}`
    + ` · 모델 드리프트 ${q.drift} · 누적 ${usd(cum)}`
}

function verdicts(form, plan, results, shared, db, sessionOutside) {
  const cross = CROSS.filter((id) => plan.ids.includes(id))
  const done = cross.filter((id) => results[id] && results[id].status === '완료')
  const bad = (kind) => Object.values(results).filter((q) => q.init && !q.init.ok && q.init.kind === kind).length
  const initFails = bad('violation'), initFormats = bad('format') // #634 9-1 major 1 — 위반 = J2 실패 · 형식 = 판정 불가
  const j2fail = sessionOutside > 0 || db.diff !== 0 || shared.verdict === '실패' || initFails > 0
  // 중첩 호출은 공유 로그로만 보인다 — 로그가 판정 불가면 J2 도 판정 불가(통과 아님 · 재실행 근거 아님 · 회귀: PR #633 Codex P2)
  const j2 = j2fail ? '실패' : initFormats || shared.verdict.startsWith('판정 불가') ? '판정 불가' : '통과'
  form.push('-- 판정')
  form.push(`J1 (사용자) 완료된 교차 ${done.length}${done.length < 3 && plan.kind === 'main' ? ' — 3 미만이면 J1 판정 불가(§5-6)' : ''}`)
  for (const id of done) form.push(`   ${id} [예 / 부분 / 아니오] 이유: ____`)
  form.push(`J2 ${j2} — init 위반 ${initFails} · init 형식 ${initFormats} · 세션 목록 밖 ${sessionOutside} · 공유 로그 ${shared.verdict}(fin MCP 기록 ${shared.fin.records} · 밖 ${shared.fin.outside} | fit MCP 기록 ${shared.fit.records} · 밖 ${shared.fit.outside}`
    + ` | 중첩 strategy:parse ${shared.nested ?? '?'} | 같은 창 fin ai_chat ${shared.finChat ?? '?'} · fit 대화 ${shared.fitChat ?? '?'}) · 원장 대조 다름 ${db.diff}/${db.total}`
    + `${shared.mixed && !j2fail ? ' — 섞임: 세션 기록 0 이라 통과로 본다(§5-6 J2)' : ''}`)
  if (shared.mixed && shared.nested > 0) form.push(`⚠ 섞인 창에 중첩 호출 ${shared.nested} — 사람 대화에서 온 것인지 확인한다(fin 봇 로그 · 원문은 붙이지 않는다)`)
  const j3ok = done.filter((id) => results[id].fin.ok >= 1 && results[id].fit.ok >= 1).length
  form.push(`J3 ${done.length && j3ok === done.length ? '통과' : done.length ? '실패' : '판정 불가'} — 완료된 교차 ${done.length} 중 두 도메인 성공 ≥1: ${j3ok}`)
  form.push(`J4 대조 기록만(Q129) — ${['D1', 'D2'].filter((id) => plan.ids.includes(id)).map((id) => `${id} ${results[id] ? results[id].status : '-'}`).join(' · ') || '이번 실행에 없음'}`)
  const ms = Object.values(results).filter((q) => q.status !== '미실행').map((q) => q.ms).sort((a, b) => a - b)
  form.push(`J5 지연 ${ms.length ? `p50 ${sec(ms[Math.floor(ms.length / 2)])} · max ${sec(ms[ms.length - 1])}` : '-'} (fit 대화 기준 p50 20.5s · p90 78.7s · §3-2)`)
  // 횟수 제외는 첫 질문이 형식 실패이고 모델 응답·비용이 0 일 때만 — 부분 결과가 있는 실행은 센다(회귀: #634 재리뷰 major 2)
  const first = results[plan.ids[0]]
  const clean = first && first.init && first.init.kind === 'format' && !first.replied && !first.cost && Object.keys(results).every((id) => id === plan.ids[0] || results[id].status === '미실행')
  return { j2, uncounted: j2 === '판정 불가' && !!clean }
}

// ── 본체 ─────────────────────────────────────────────────────────────
async function preflight(args, form, started) {
  const self = fs.realpathSync(__filename)
  if (CHECKOUTS.some((c) => self.startsWith(c + path.sep)) || insideGit(path.dirname(self))) stop('설치: 스크립트가 체크아웃 안에 있다(Q115 — 체크아웃 밖 커밋 고정 설치)')
  if (process.env.X1_LOCK_HELD !== '1') stop('S-1: run-x1.sh 를 거치지 않았다(배포 락 없음) — 시작 안 함')
  const win = checkWindow(started)
  form.push(`S-1 배포 락: 잡음(${safeName(process.env.X1_LOCK_KIND || '?')}) · 시각 ${kstParts(started).hm} KST · ${win ? `창 밖(${win})` : '크론 창 안'}`)
  if (win && !args.preflight) stop(`S-1: 시작 안 함 — ${win}`)
  ensurePrivateDir(PRIVATE)
  const real = fs.realpathSync(PRIVATE)
  if (CHECKOUTS.some((c) => real.startsWith(c + path.sep)) || insideGit(real)) stop('입력: 비공개 위치가 체크아웃 안이다')
  ensurePrivateDir(X1_DIR)
  const questions = parseQuestions(privateFile(path.join(X1_DIR, 'questions.txt'), 'questions.txt'))
  const qhash = sha(JSON.stringify(questions))
  const state = loadState()
  const plan = args.preflight ? { kind: 'preflight', ids: [], budget: CONFIG.budgetUsd } : planRun(args, state, qhash)
  const knowledge = plan.kind === 'prompt' ? privateFile(path.join(X1_DIR, 'knowledge.txt'), 'knowledge.txt').trim() : ''
  if (plan.kind === 'prompt' && (!knowledge || Buffer.byteLength(knowledge) > CONFIG.knowledgeMaxBytes)) stop(`입력: knowledge.txt 가 비었거나 ${CONFIG.knowledgeMaxBytes}바이트를 넘는다`)
  const runDir = path.join(X1_DIR, 'runs', `${kstParts(started).stamp}-${plan.kind}`)
  ensurePrivateDir(runDir)
  const cwd = path.join(runDir, 'cwd')
  ensurePrivateDir(cwd)
  const userHash = checkSettings(cwd, form)
  const pin = pins()
  const bin = resolveClaude(args.claudeBin)
  const env = childEnv(pin)
  const before = cliVersion(bin, env)
  if (!before) stop('S-4: claude --version 실패')
  const help = spawnSync(bin, ['--help'], { env, encoding: 'utf8', timeout: CONFIG.cliMs, stdio: ['ignore', 'pipe', 'pipe'] })
  const missing = REQUIRED_OPTIONS.filter((o) => !`${help.stdout || ''}${help.stderr || ''}`.includes(o))
  form.push(`S-4 CLI: 전 ${before} · 자식 env DISABLE_AUTOUPDATER=1 · 모델 핀 두 앱 같음(sonnet) · 필요 옵션 ${REQUIRED_OPTIONS.length - missing.length}/${REQUIRED_OPTIONS.length}`)
  if (missing.length) stop(`S-4: CLI help 에 없는 옵션 ${missing.length}(${missing.join(' ')}) — 실행 안 함`)
  const pr = state.probe
  if (!args.preflight && !(pr && pr.ok && pr.version === before)) stop(`S-3: 같은 CLI 버전(${before})의 init 탐침 통과가 없다 — --preflight 먼저(회귀: #634 9-1 major 2)`)
  const lists = await checkTools(form)
  const db = { fin: dbSnapshot('fin'), fit: dbSnapshot('fit') }
  form.push(`Q131 원장 스냅샷: fin ${APPS.fin.ledger.length} · fit ${APPS.fit.ledger.length} 테이블 읽음`)
  const ctx = { questions, qhash, state, plan, knowledge, runDir, cwd, pin, bin, env, before, lists, db, userHash }
  if (args.preflight) await probeInit(ctx, form)
  return ctx
}

// 본 실행·재실행·탐침이 같은 인자를 쓴다(탐침은 그 인자의 init 을 본다)
function sessionArgs(ctx) {
  const { plan, lists, pin, runDir } = ctx
  const system = plan.kind === 'prompt' ? `${SYSTEM_PROMPT}\n\n## 도메인 참고\n${ctx.knowledge}` : SYSTEM_PROMPT
  const mcpConfig = path.join(runDir, 'mcp-config.json')
  writePrivate(mcpConfig, JSON.stringify({ mcpServers: { [APPS.fin.serverKey]: { type: 'http', url: lists.urls.fin },
    [APPS.fit.serverKey]: { type: 'http', url: lists.urls.fit } } }, null, 2))
  return cliArgs(pin.sonnet, system, mcpConfig, lists, plan.budget)
}

const initCheck = (lists) => (e) => judgeInit(e, new Set(lists.allow), [APPS.fin.serverKey, APPS.fit.serverKey])
const initCounts = (i) => (i.plugins === undefined ? '' : ` · 플러그인 ${i.plugins}(내장 ${i.builtin || 0} 제외) · MCP 서버 ${i.servers}(연결 ${i.connected}) · 목록 밖 도구 ${i.outside}`)

// #634 9-1 major 2 — 사전 판정의 init 탐침: 실제와 같은 인자로 띄워 첫 init 줄을 받는 즉시 SIGKILL. init 은 CLI 가 질의 시작 때
// (API 호출 전) 내는 첫 이벤트다(2.1.322 코드 · 2.1.308 은 런북 8절). 통과를 CLI 버전과 함께 state 에 남긴다 — 본 실행은 이것을 요구한다
async function probeInit(ctx, form) {
  const r = await askOnce(ctx.bin, sessionArgs(ctx), ctx.env, ctx.cwd, 'X1 탐침 — 이 메시지에는 답하지 않는다.', path.join(ctx.runDir, 'stream-probe.jsonl'), initCheck(ctx.lists), true)
  const { result } = parseStream(r.out)
  const i = r.init
  const prev = ctx.state.probe || {}, allowHash = sha(ctx.lists.allow.join(','))
  const same = (a, b) => (a === undefined ? '첫 기록' : a === b ? '같음' : '다름')
  ctx.state.probe = { ok: i.ok, version: ctx.before, userHash: ctx.userHash, allowHash, at: Date.now() }
  writePrivate(STATE(), JSON.stringify(ctx.state, null, 2))
  form.push(`init 탐침: ${i.ok ? '통과' : `${i.kind === 'violation' ? '위반' : '형식'}(${i.why})`}${initCounts(i)} · 모델 응답 ${r.replied || result ? `있음 · 비용 ${usd(result && result.total_cost_usd)}` : '없음'} · CLI ${ctx.before}`
    + ` · 직전 탐침 대비 user 범위 ${same(prev.userHash, ctx.userHash)} · 허용 목록 ${same(prev.allowHash, allowHash)}`)
  if (!i.ok) stop('S-3: init 탐침이 통과하지 않았다 — 본 실행 불가(런북 3절)')
}

async function experiment(ctx, form) {
  const { plan } = ctx
  const args = sessionArgs(ctx)
  form.push(`S-6 호출당 상한 ${usd(plan.budget)} · 목표 총액 ${usd(CONFIG.targetUsd)} · 세션 기록 끔 · 내장 도구 끔 · dontAsk · 프롬프트 ${plan.kind === 'prompt' ? '변형(K2 지식 덧붙임)' : '기본'} · 원문은 비공개 파일`)
  // 같은 락 아래 기록 직전에 탐침을 한 번 더 — preflight 뒤 user 설정·분류 목록이 바뀌었으면 여기서 멈춘다(횟수에 안 든다 · 회귀: #634 재리뷰 major 1)
  await probeInit(ctx, form)
  const record = { kind: plan.kind, at: Date.now(), qhash: ctx.qhash, status: {}, j2: '진행 중' }
  ctx.state.runs.push(record)
  writePrivate(STATE(), JSON.stringify(ctx.state, null, 2)) // 첫 질문 전에 남긴다 — 중간에 죽어도 횟수에 든다
  try {
    await questionsAndVerdicts(ctx, form, args, record)
  } catch (e) {
    record.j2 = '예외 종료' // 횟수에 든다 · 재실행을 막는다(원인 확인 먼저)
    writePrivate(STATE(), JSON.stringify(ctx.state, null, 2))
    throw e
  }
}

async function questionsAndVerdicts(ctx, form, args, record) {
  const { plan, questions, lists, pin, bin, env, cwd, runDir } = ctx
  const answers = path.join(runDir, 'answers.md')
  writePrivate(answers, `# X1 ${plan.kind} 답 원문(비공개 · 600)\n`)
  const results = {}
  let cum = 0, initStop = null
  const t0 = Date.now()
  form.push('-- 질문')
  for (const id of plan.ids) {
    const win = checkWindow(nowDate())
    const reason = initStop ? initStop : cum === null ? '비용 미상' : cum >= CONFIG.targetUsd ? '누적 목표 도달' : win ? '크론 창 끝' : null
    if (reason) {
      results[id] = { status: '미실행', reason }
      form.push(questionLine(id, results[id], cum))
      continue
    }
    if (TEST && process.env.X1_TEST_THROW === id) throw Object.assign(new Error('test'), { code: 'ETEST' }) // 예외 경로 시험용
    const now = kstParts(nowDate())
    const prompt = `현재 시각: ${now.date} ${now.hm} KST\n\n---\n\n사용자 질문: ${questions[id]}`
    const r = await askOnce(bin, args, env, cwd, prompt, path.join(runDir, `stream-${id}.jsonl`), initCheck(lists))
    const q = judgeAnswer(r, lists, pin)
    cum = q.cost === null || cum === null ? null : cum + q.cost
    results[id] = q
    if (!initStop && !q.init.ok) initStop = q.init.kind === 'violation' ? 'init 실패' : 'init 형식'
    fs.appendFileSync(answers, `\n## ${id} (${KIND[id]}) · ${q.status}\n\n### 질문\n${questions[id]}\n\n### 도구\n${q.calls.map((c) => `${c.name}${c.ok ? '' : ' (실패)'}`).join('\n') || '(없음)'}\n\n### 답\n${q.text}\n`)
    form.push(questionLine(id, q, cum))
  }
  const t1 = Date.now(), after = cliVersion(bin, env)
  let dbAfter = null
  try { dbAfter = { fin: dbSnapshot('fin'), fit: dbSnapshot('fit') } } catch (e) { if (!(e instanceof Stop)) throw e } // 질문 뒤라 멈추지 않는다 — 대조 실패 = J2 실패
  const sessionOutside = Object.values(results).reduce((s, q) => s + (q.outside || 0), 0)
  const sessionCounts = { fin: Object.values(results).some((q) => q.fin && q.fin.n), fit: Object.values(results).some((q) => q.fit && q.fit.n) }
  const shared = sharedLogs(lists, t0, t1, sessionCounts)
  const db = dbAfter ? dbDiff(ctx.db, dbAfter) : { diff: '?(실행 뒤 조회 실패)', total: APPS.fin.ledger.length + APPS.fit.ledger.length }
  form.push(`S-4 CLI 후 ${after || '?'} → ${after === ctx.before ? '같음' : '다름 — 운영 advisor 영향 확인(#255 · R-11)'}`, `누적 비용 ${usd(cum)} · 배포 겹침 0(락을 끝까지 쥠)`)
  const { j2, uncounted } = verdicts(form, plan, results, shared, db, sessionOutside)
  // init 형식 문제로 끊긴 실행은 횟수에 넣지 않는다(CLI 형식 확인 뒤 다시 · 회귀: #634 9-1 major 1) — 기록은 남긴다
  Object.assign(record, { j2, cost: cum, counted: !uncounted, status: Object.fromEntries(Object.entries(results).map(([id, q]) => [id, q.status])) })
  writePrivate(STATE(), JSON.stringify(ctx.state, null, 2))
  const left = 2 - counted(ctx.state).length
  if (uncounted) {
    ctx.state.probe.ok = false // 다음 실행 전에 --preflight 를 다시 요구한다(회귀: #634 재리뷰 major 2)
    writePrivate(STATE(), JSON.stringify(ctx.state, null, 2))
    form.push('실행 횟수: 이번 실행은 세지 않는다(첫 질문 init 형식 · 모델 응답 0) — CLI init 형식을 Claude 와 확인하고 --preflight 부터 다시')
  }
  form.push(`재실행: 남은 ${left}회${left > 0 && j2 === '통과' ? ' — 가능하면 --rerun=prompt(J1·J3 실패) · budget(판정 불가) · resume(미실행) 중 하나(§5-6)' : ''}`)
}

function parseArgs(argv) {
  const a = {}
  for (const x of argv) {
    if (x === '--preflight') a.preflight = true
    else if (/^--rerun=(budget|resume|prompt)$/.test(x)) a.rerun = x.slice(8)
    else if (/^--max-budget=\d+(\.\d+)?$/.test(x)) a.maxBudget = Number(x.slice(13))
    else if (x.startsWith('--claude-bin=')) a.claudeBin = x.slice(13)
    else return null
  }
  return a.preflight && (a.rerun || a.maxBudget !== undefined) ? null : a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args) {
    console.error('사용법: run-x1.sh [--preflight | --rerun=<budget|resume|prompt> [--max-budget=<usd>]] [--claude-bin=<절대 경로>]')
    return 2
  }
  if (process.platform === 'darwin' && !TEST) {
    console.log('결과: 중단 — 서버 전용이다(I-3 · 로컬에서 claude 를 실행하지 않는다)')
    return 1
  }
  process.umask(0o077)
  const started = nowDate()
  const form = [`===== 011 X1 판정 양식 · ${args.preflight ? '사전 판정' : args.rerun ? `재실행(${args.rerun})` : '본 실행'} · ${kstParts(started).date} =====`]
  let code = 0
  let runDir = null
  let fatal = null
  try {
    const ctx = await preflight(args, form, started)
    runDir = ctx.runDir
    if (args.preflight) form.push('결과: 사전 판정 통과 — 질문 0(--preflight)')
    else {
      await experiment(ctx, form)
      form.push('결과: 실행 끝 — J1 칸을 채워 붙인다')
    }
  } catch (e) {
    if (e instanceof Stop) form.push(e.message, '결과: 시작 안 함 — 질문 0')
    else {
      fatal = e
      form.push(`결과: 실패 — 예외 ${errCode(e)}`) // 그때까지의 양식은 남긴다 · 메시지에 경로가 실릴 수 있어 코드만
    }
    code = 1
  }
  form.push('====================')
  const text = form.join('\n')
  console.log(text)
  if (runDir) writePrivate(path.join(runDir, 'form.txt'), `${text}\n`)
  if (fatal) throw Object.assign(fatal, { printed: true })
  return code
}

main().then(
  (code) => process.exit(code),
  (err) => {
    if (!(err && err.printed)) console.log(`결과: 실패 — 예외 ${errCode(err)}`)
    process.exit(1)
  },
)
