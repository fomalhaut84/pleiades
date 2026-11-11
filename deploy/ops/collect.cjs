#!/usr/bin/env node
// collect.cjs — 008 단계 1 수집기 (#568 · 설계 008 §2 확정 블록 · 세부 _workspace/250/02_writer_stage1_r2.md).
//
// 사용:  node collect.cjs --dry-run [--pm2-bin=<절대 경로>]   수집 1회(crontab 이 부른다)
//
// PR-1 은 --dry-run 만이다 — 외부로 나가는 것이 0 이다. 게시할 메시지는 상태 디렉터리의 dry-run.log 에 쓴다(Discord 게시는 PR-2).
// 서비스 계정으로 돈다(Q97). 체크아웃 밖(~/pleiades-ops/)에 커밋 고정으로 설치한다 — 런북 docs/runbooks/ops-collector.md.
//
// 코드가 지키는 규칙(008 §4-6 "없음" 행의 단계 1 판):
//  - pm2 호출은 jlist 하나 · rpc.sock 연결 시험이 통과한 수집에서만 부른다(데몬이 없으면 CLI 가 빈 데몬을 띄운다 · E-1)
//  - pm2 는 process.execPath 로 부른다(셔뱅 /usr/bin/env node 는 크론 PATH 에서 실패한다 · E-2)
//  - 배포 잠금 파일은 열지도 잠그지도 않는다(배포가 flock -n 이라 멈춘다 · E-3) — 배포 표지 두 파일의 존재·수정 시각·내용만 읽는다
//  - jlist 원문 · 로그 원문 · .env 값은 파일·출력에 쓰지 않는다 — 지문 재료는 허용 문자 칸만(§1-2 · §1-4 ⓪)
'use strict'

process.env.TZ = 'Asia/Seoul' // 시각 표시와 일일 요약 날짜는 서버 시간대와 무관하게 KST 다

const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const net = require('net')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const TEST = process.env.PLEIADES_TEST === '1'
const HOME = os.homedir()

// 설계 파라미터(008 Q100 · 미결) — 값은 판단이다. 서버 dry-run 판정으로 사용자와 정한다(PR-2 전).
const DEFAULTS = {
  periodMin: 5, // P-0 수집 주기 — crontab 줄과 같게 둔다
  repeatMin: 60, // P-1 같은 지문은 N분에 1회
  recoverRuns: 2, // P-2 상태형 정상 M회 연속이면 복구 1회
  burstLimit: 5, // P-3 한 수집의 새 지문이 L개를 넘으면 요약 1건
  summaryAt: '09:05', // P-4 일일 요약 시각(KST)
  retainDays: 14, // P-5 지문·이벤트 보존
  maxStateBytes: 1048576, // P-5 상태 파일 상한
  disk: { warn: 80, crit: 90 }, // P-6 홈·백업 파일시스템 각각(사용률 · inode 사용률)
  holdMin: 20, // P-7 배포 표지 보류 종료(배포 실측 fin 105~136 s · fit 60~81 s 보다 길게)
  lockStaleRuns: 3, // P-8 잠금 stale = 주기의 k배
  maxRunMs: 120000, // P-9 한 회 상한(제약 P-8×주기 > P-9)
  lateRuns: 3, // C-7 ④ 직전 수집이 주기의 k배 넘게 지나면
  // C-7 ② 침묵 감지 — -out 만 · 역할별(V17: 줄이 꾸준한 out 5개 · fin web out · 모든 -error 는 끈다) · 값 = N시간
  // 6 → 24(#587): dry-run 판정에서 bot·mcp -out 은 낮에도 6시간씩 조용했다(사용·크론 때만 는다) — 하루 크론이 도는지만 본다
  silenceHours: { 'fin-bot': 24, 'fin-mcp': 24, 'fit-web': 24, 'fit-bot': 24, 'fit-mcp': 24 },
  readCapBytes: 4 * 1048576, // 한 파일을 한 회에 읽는 상한 — 남은 것은 다음 회
  socketMs: 2000,
  jlistMs: 20000,
  httpMs: 5000,
}
const CONFIG = TEST && process.env.OPS_CONFIG ? { ...DEFAULTS, ...JSON.parse(process.env.OPS_CONFIG) } : DEFAULTS
const MIN = 60000

const APPS = {
  fin: path.join(HOME, 'pleiades-fin', 'apps', 'finance'),
  fit: path.join(HOME, 'pleiades-fit', 'apps', 'fitness'),
}
const ROLES = ['web', 'bot', 'mcp']
const PM2_HOME = process.env.PM2_HOME || path.join(HOME, '.pm2')
const PRIVATE = process.env.PLEIADES_PRIVATE_DIR || path.join(HOME, 'pleiades-private') // release-inplace.sh 와 같은 규칙
const OPS_DIR = path.join(PRIVATE, 'ops')
const DISKS = {
  home: TEST && process.env.OPS_DISK_HOME ? process.env.OPS_DISK_HOME : HOME,
  backup: TEST && process.env.OPS_DISK_BACKUP ? process.env.OPS_DISK_BACKUP : '/backup',
}

// 판정 계약(release-inplace.sh:106 · #373) — chat 이 gateway 정상 기동을 warn 으로 찍는다
// 첫 단계(1000ms) RESUME 재접속은 Discord 의 일상 재접속이다(#583 A) — 5000ms 이상 · 새 세션은 그대로 센다
const NORMAL_GATEWAY = /\] gateway (준비 완료|세션 이어받음|재접속 1000ms 후 \(RESUME\))$/
// release-inplace.sh C5 경고 패턴 + Deprecat…(#587 · 수집기만 — C5 는 배포 경로라 그대로 둔다)
const WARN_RE = /⚠|[Ww]arning|Deprecat/
// 알려진 stderr 줄(#587) — 세부 칸이 비어 한 지문으로 묶이던 것을 정해진 토큰 하나로 가른다(원문은 칸에 오지 않는다)
const KNOWN_STDERR = [
  { re: /Server Reference ID did not match the expected format/, kind: 'server-action-ref', sev: '경고' }, // 외부 스캐너의 Server Action 요청
  { re: /The width\(-?\d+\) and height\(-?\d+\) of chart should be greater than 0/, kind: 'chart-size', sev: '경고' }, // Recharts · #588
]
const PM2_PREFIX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}: / // pleiades.config.cjs log_date_format + pm2 의 ': '
const LOG_NAME = /^pleiades-(fin|fit)-(web|bot|mcp)-(out|error)(?:-\d+)?\.log$/
const FIELD_OK = /^[A-Za-z0-9_.:/-]{1,64}$/ // §1-4 ⓪
const ERRNO = new Set(Object.keys(os.constants.errno)) // §1-2 코드 = errno 이름 목록 안의 값만(E-6)
const SEV = { 장애: '🔴', 실패: '🟠', 경고: '🟡', 복구: '🟢' }

const pad = (n) => String(n).padStart(2, '0')
const kstDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const kstMinute = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
const field = (s) => (typeof s === 'string' && FIELD_OK.test(s) ? s : '')
const md = (s) => s.replace(/([\\*_~`|<>#[\]-])/g, '\\$1') // notify-deploy.cjs 와 같은 escape
const errCode = (e) => (e && typeof e.code === 'string' && ERRNO.has(e.code) ? e.code : 'error')

// ── 관측 ─────────────────────────────────────────────────────────────
// 관측 = 지문 재료(허용 칸만) + 심각도 + 종류(state: 상태형 · 복구 있음 / event: 로그형 · 복구 없음) + scope(복구 판정 단위)
function observation(app, role, src, detail, sev, kind, count = 1) {
  const material = [app, role, src, ...detail].join(' · ')
  return { app, role, src, detail, sev, kind, count, material, scope: kind === 'state' ? [app, role, src].join(' · ') : null }
}
const collector = (code, kind = 'state', sev = '경고') => observation('ops', 'collector', code, [], sev, kind)
const fpOf = (material) => crypto.createHash('sha256').update(material).digest('hex').slice(0, 12)

// ── C-0 · C-1 pm2 ────────────────────────────────────────────────────
function probeSocket(file) {
  return new Promise((resolve) => {
    const sock = net.connect(file)
    const done = (ok) => {
      sock.destroy()
      resolve(ok)
    }
    sock.setTimeout(CONFIG.socketMs, () => done(false))
    sock.once('connect', () => done(true)) // RPC 메시지 0 — 연결하고 곧 닫는다
    sock.once('error', () => done(false))
  })
}

// jlist 앞에는 "[PM2][WARN] …" 줄이 붙을 수 있다 — release-inplace.sh:81 과 같은 방식으로 연다
function parseJlist(stdout) {
  const i = stdout.indexOf('[{')
  const list = JSON.parse(i >= 0 ? stdout.slice(i) : stdout.slice(stdout.lastIndexOf('[]')))
  if (!Array.isArray(list)) throw new Error('shape')
  const out = {}
  for (const p of list) {
    if (!p || typeof p.name !== 'string' || !p.name.startsWith('pleiades-')) continue // pleiades 밖 프로세스(V15)는 버린다
    if (out[p.name]) continue
    const env = p.pm2_env || {}
    out[p.name] = { status: String(env.status ?? p.status ?? ''), restart: Number(env.restart_time ?? p.restart_time ?? 0) } // 허용 목록만
  }
  return out
}

function readJlist(bin) {
  const run = spawnSync(process.execPath, [bin, 'jlist'], {
    encoding: 'utf8',
    timeout: CONFIG.jlistMs,
    maxBuffer: 64 * 1048576,
    env: { ...process.env, PM2_HOME },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (run.error || run.status !== 0) return { error: 'jlist-run' }
  try {
    return { procs: parseJlist(run.stdout) }
  } catch {
    return { error: 'jlist-parse' } // 원문은 어디에도 쓰지 않는다
  }
}

function judgePm2(ctx, procs) {
  const { obs, evaluated, state, deploy } = ctx
  const expected = Object.keys(APPS).flatMap((a) => ROLES.map((r) => [a, r]))
  evaluated.add('ops · pm2 · all-missing')
  if (expected.every(([a, r]) => !procs[`pleiades-${a}-${r}`])) {
    obs.push(observation('ops', 'pm2', 'all-missing', [], '장애', 'state'))
    return
  }
  for (const [app, role] of expected) {
    const name = `pleiades-${app}-${role}`
    const p = procs[name]
    const base = state.restarts[name]
    if (p) state.restarts[name] = p.restart
    if (deploy[app].held) continue // 배포 창 — 상태 변화는 보류 · 재시작 수는 기준값 갱신만
    evaluated.add(`${app} · ${role} · pm2`)
    if (!p) {
      obs.push(observation(app, role, 'pm2', ['missing'], '장애', 'state'))
      continue
    }
    if (p.status !== 'online') obs.push(observation(app, role, 'pm2', [`status:${field(p.status)}`], '장애', 'state'))
    // 감소 = 재등록(기준값 리셋) · last-ok 가 바뀐 수집 = 배포 재시작(기준값 갱신만)
    if (base !== undefined && p.restart > base && !deploy[app].lastOkChanged) {
      obs.push(observation(app, role, 'pm2', ['restart'], '실패', 'event', p.restart - base))
    }
  }
}

async function collectPm2(ctx, bin) {
  ctx.evaluated.add('ops · collector · pm2-bin')
  if (!path.isAbsolute(bin) || !fs.existsSync(bin)) {
    ctx.obs.push(collector('pm2-bin'))
    return
  }
  ctx.evaluated.add('ops · pm2 · daemon')
  if (!(await probeSocket(path.join(PM2_HOME, 'rpc.sock')))) {
    ctx.obs.push(observation('ops', 'pm2', 'daemon', ['none'], '장애', 'state')) // 이번 수집에서 pm2 CLI 를 부르지 않는다
    return
  }
  for (const code of ['jlist-run', 'jlist-parse']) ctx.evaluated.add(`ops · collector · ${code}`)
  const r = readJlist(bin)
  if (r.error) ctx.obs.push(collector(r.error))
  else judgePm2(ctx, r.procs)
}

// ── 배포 창(§1-3) ────────────────────────────────────────────────────
function readMarker(file) {
  try {
    const st = fs.statSync(file)
    return { mtimeMs: st.mtimeMs, body: fs.readFileSync(file, 'utf8').trim() }
  } catch {
    return null
  }
}

// release-inplace.sh 가 통과 때 쓰는 C5 창 "t0\tt1"(#587) — 형식이 다르면 없는 것으로 본다(흡수하지 않는다)
const WINDOW_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\t(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})$/
function c5Window(app) {
  const m = WINDOW_RE.exec((readMarker(path.join(PRIVATE, `inplace-${app}-window`)) || {}).body || '')
  return m && m[1] <= m[2] ? { t0: m[1], t1: m[2] } : null
}

function deployWindow(ctx) {
  const out = {}
  for (const app of Object.keys(APPS)) {
    const pending = readMarker(path.join(PRIVATE, `inplace-${app}-pending`))
    const lastOk = readMarker(path.join(PRIVATE, `inplace-${app}-last-ok`))
    const sig = lastOk ? `${lastOk.body}@${lastOk.mtimeMs}` : ''
    const prev = ctx.state.lastOk[app]
    ctx.state.lastOk[app] = sig
    const stale = Boolean(pending) && ctx.now - pending.mtimeMs >= CONFIG.holdMin * MIN
    ctx.evaluated.add(`ops · collector · deploy-stale:${app}`)
    if (stale) ctx.obs.push(collector(`deploy-stale:${app}`)) // 보류를 끝내고 평소대로 판정한다
    out[app] = { held: Boolean(pending) && !stale, lastOkChanged: prev !== undefined && prev !== sig, window: c5Window(app) }
  }
  return out
}

// ── C-2 · C-3 health ─────────────────────────────────────────────────
function dotenvFor(app) {
  for (const dir of [APPS[app], ...Object.values(APPS)]) {
    try {
      return require(require.resolve('dotenv', { paths: [dir] })) // fin → fit 폴백(db-backup.cjs 와 같다)
    } catch {
      // 다음 체크아웃
    }
  }
  return null
}

function readPorts(app) {
  const dotenv = dotenvFor(app)
  if (!dotenv) return null
  try {
    const env = dotenv.parse(fs.readFileSync(path.join(APPS[app], '.env')))
    const ok = (v) => /^[1-9][0-9]{0,4}$/.test(v || '') && Number(v) <= 65535
    return ok(env.PORT) && ok(env.MCP_PORT) ? { web: Number(env.PORT), mcp: Number(env.MCP_PORT) } : null
  } catch {
    return null
  }
}

function probeHttp(port, urlPath) {
  return new Promise((resolve) => {
    let settled = false
    let timer = null
    const done = (r) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve(r)
      }
    }
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, agent: false }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (d) => {
        if (body.length < 4096) body += d
      })
      res.on('end', () => done({ code: res.statusCode, body }))
      res.on('error', () => done({ code: res.statusCode, body }))
    })
    // 전체 상한 — req.setTimeout 은 idle 상한이라 조금씩 보내는 응답을 끊지 못한다(9-1 info)
    timer = setTimeout(() => {
      done({ grade: 'timeout' })
      req.destroy()
    }, CONFIG.httpMs)
    req.on('error', () => done({ grade: '000' }))
  })
}

const gradeOf = (code) => (code >= 500 ? '5xx' : code >= 400 ? '4xx' : code >= 300 ? '3xx' : '2xx')

async function collectHealth(ctx) {
  for (const app of Object.keys(APPS)) {
    if (ctx.deploy[app].held) continue
    ctx.evaluated.add(`ops · collector · env-read:${app}`)
    const ports = readPorts(app)
    if (!ports) {
      ctx.obs.push(collector(`env-read:${app}`))
      continue
    }
    const [mcp, web] = await Promise.all([probeHttp(ports.mcp, '/health'), probeHttp(ports.web, '/')])
    ctx.evaluated.add(`${app} · mcp · health`)
    let ok = false
    try {
      ok = mcp.code === 200 && JSON.parse(mcp.body).ok === true
    } catch {
      // 200 이어도 ok 가 없으면 이상이다
    }
    if (!ok) ctx.obs.push(observation(app, 'mcp', 'health', [mcp.grade || (mcp.code === 200 ? '200-notok' : gradeOf(mcp.code))], '장애', 'state'))
    ctx.evaluated.add(`${app} · web · http`)
    // fin 은 미인증 요청을 307 로 돌린다 — 미들웨어가 살아 있다는 것까지만 증명한다(K-6)
    if (web.grade || web.code >= 400) ctx.obs.push(observation(app, 'web', 'http', [web.grade || gradeOf(web.code)], '장애', 'state'))
  }
}

// ── C-4 · C-5 로그 ───────────────────────────────────────────────────
// 산출물 상대 파일 경로만 — 줄·열은 버린다(릴리즈마다 바뀐다 · E-5) · 청크 이름은 빌드마다 달라 비운다
function artifactOf(text) {
  const m = /(?:^|[\s(])(\/[^\s():]+):\d+:\d+/m.exec(text || '')
  if (!m) return ''
  const rel = /\/apps\/(?:finance|fitness)\/(.+)$/.exec(m[1])
  if (!rel || /^\.next\/server\/(chunks|app)\//.test(rel[1])) return ''
  return field(rel[1])
}

function codeOf(text, explicit) {
  if (typeof explicit === 'string' && ERRNO.has(explicit)) return explicit
  for (const m of (text || '').matchAll(/\bE[A-Z0-9]+\b/g)) if (ERRNO.has(m[0])) return m[0]
  return ''
}

// pm2 접두 시각을 문자열 그대로 — C5 창(release-inplace.sh 의 date '+%F %T')과 같은 서버 로컬 시각이라 문자열로 비교한다(시간대를 해석하지 않는다)
const STAMP = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}): /
const stampOf = (line) => (STAMP.exec(line) || [])[1] || null

// 덩어리 = { at: 첫 줄 시각 문자열(없으면 null), lines }
function chunksOf(lines) {
  const chunks = []
  for (const line of lines) {
    if (PM2_PREFIX.test(line) || chunks.length === 0) chunks.push({ at: stampOf(line), lines: [line.replace(PM2_PREFIX, '')] })
    else chunks[chunks.length - 1].lines.push(line) // 시각 없는 뒷줄은 앞 줄의 덩어리(S5)
  }
  return chunks
}

// P-7(#587): 마지막으로 통과한 배포의 C5 창 [t0, t1] 안 경고 줄은 배포 알림이 이미 셌다 — 수집기는 흡수한다. 실패는 그대로 낸다.
// 창은 release-inplace.sh 가 통과 때만 남긴다 — 실패한 시도의 줄은 아무도 세지 않았으니 흡수하지 않는다(PR-1b 9-1 major)
const inDeployWindow = (at, win) => at !== null && win !== null && at >= win.t0 && at <= win.t1

function stderrObs(app, role, lines, win = null) {
  const out = []
  for (const { at, lines: chunk } of chunksOf(lines)) {
    const head = chunk[0]
    if (!head.trim() || NORMAL_GATEWAY.test(head)) continue
    const text = chunk.join('\n')
    const known = KNOWN_STDERR.find((k) => k.re.test(head))
    const sev = known ? known.sev : WARN_RE.test(head) ? '경고' : '실패'
    if (sev === '경고' && inDeployWindow(at, win)) continue
    if (known) {
      out.push(observation(app, role, 'stderr', [known.kind], sev, 'event'))
      continue
    }
    const tag = field((/^\[([^\]]{1,64})\]/.exec(head) || [])[1])
    const cls = field((/\b[A-Z][A-Za-z]*Error\b/.exec(text) || [])[0])
    out.push(observation(app, role, 'stderr', [tag, cls, codeOf(text), artifactOf(text)], sev, 'event'))
  }
  return out
}

const ERROR_LEVELS = new Set(['error', 'fatal'])
function mcpOutObs(app, lines, ctx) {
  const out = []
  for (const raw of lines) {
    const line = raw.replace(PM2_PREFIX, '')
    if (!line.startsWith('{')) continue
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      ctx.parseFail[app] = (ctx.parseFail[app] || 0) + 1
      continue
    }
    const lv = rec && rec.level
    if (!(ERROR_LEVELS.has(lv) || (typeof lv === 'number' && lv >= 50))) continue // V14: 문자열 · 숫자도 받는다
    const err = rec.err && typeof rec.err === 'object' ? rec.err : {}
    out.push(observation(app, 'mcp', 'out', ['', field(err.type), codeOf('', err.code), artifactOf(err.stack)], '실패', 'event'))
  }
  return out
}

function readNew(file, name, st, ctx) {
  const prev = ctx.state.files[name]
  let off
  if (!ctx.hadState) off = st.size // 상태 파일이 없을 때만 끝에서 — 과거 로그 폭주 방지
  else if (!prev || prev.ino !== st.ino || st.size < prev.off) off = 0 // 새 파일 · inode 바뀜 · 크기 줄어듦 = 0 부터(E-8)
  else off = prev.off
  const len = Math.min(st.size - off, CONFIG.readCapBytes)
  let lines = []
  if (len > 0) {
    const buf = Buffer.alloc(len)
    const fd = fs.openSync(file, 'r') // 실패는 호출자가 그 파일만 log-read 로 올린다 — 오프셋은 그대로(9-1 major)
    try {
      fs.readSync(fd, buf, 0, len, off)
    } finally {
      fs.closeSync(fd)
    }
    let end = buf.lastIndexOf(0x0a) + 1 // 끝나지 않은 줄은 다음 회에
    if (end === 0 && len === CONFIG.readCapBytes) end = len // 상한보다 긴 한 줄 — 건너뛰지 않으면 그 파일이 영영 멈춘다(9-1 info)
    lines = buf.subarray(0, end).toString('utf8').split('\n').slice(0, -1)
    off += end
  }
  ctx.state.files[name] = { ino: st.ino, off }
  return lines
}

function collectLogs(ctx) {
  const dir = path.join(PM2_HOME, 'logs')
  let names = []
  let listed = true
  ctx.evaluated.add('ops · collector · logs-dir')
  try {
    names = fs.readdirSync(dir).filter((n) => LOG_NAME.test(n))
  } catch {
    listed = false // 오프셋을 지우지 않는다 — 지우면 다음 회가 모든 파일을 0 부터 읽어 과거 로그가 쏟아진다(9-1 info)
    ctx.obs.push(collector('logs-dir'))
  }
  const seen = {}
  const sizes = {}
  for (const name of names) {
    const [, app, role, stream] = LOG_NAME.exec(name)
    const key = `${app}-${role}-${stream}`
    let st
    try {
      st = fs.statSync(path.join(dir, name))
    } catch {
      continue
    }
    seen[key] = true
    sizes[key] = (sizes[key] || 0) + st.size
    if (stream === 'out' && role !== 'mcp') continue // web·bot -out 은 침묵 감지(C-7 ②)에만
    // 보류 중에는 -error 를 읽지 않는다(오프셋 그대로) — 배포가 끝나 창이 정해진 뒤 읽어야 창 안 경고만 흡수한다(PR-1b 9-1 major)
    if (stream === 'error' && ctx.deploy[app].held) {
      // 상태가 없는 첫 회면 기준 오프셋(끝)만 남긴다 — 안 남기면 보류가 끝난 뒤 0 부터 읽어 과거 로그가 쏟아진다(PR #590 Codex P2)
      if (!ctx.hadState) ctx.state.files[name] = { ino: st.ino, off: st.size }
      continue
    }
    ctx.evaluated.add(`ops · collector · log-read:${key}`)
    let lines
    try {
      lines = readNew(path.join(dir, name), name, st, ctx)
    } catch {
      ctx.obs.push(collector(`log-read:${key}`)) // 한 파일 때문에 수집 전체가 멈추지 않게(9-1 major)
      continue
    }
    ctx.obs.push(...(stream === 'out' ? mcpOutObs(app, lines, ctx) : stderrObs(app, role, lines, ctx.deploy[app].window)))
  }
  if (listed) for (const name of Object.keys(ctx.state.files)) if (!names.includes(name)) delete ctx.state.files[name]
  for (const app of Object.keys(APPS)) {
    for (const key of [`${app}-web-error`, `${app}-bot-error`, `${app}-mcp-out`, `${app}-mcp-error`]) {
      ctx.evaluated.add(`ops · collector · glob-empty:${key}`)
      if (!seen[key]) ctx.obs.push(collector(`glob-empty:${key}`))
    }
    ctx.evaluated.add(`ops · collector · json-parse:${app}`)
    if (ctx.parseFail[app]) ctx.obs.push(collector(`json-parse:${app}`))
  }
  silence(ctx, sizes)
}

function silence(ctx, sizes) {
  for (const [key, hours] of Object.entries(CONFIG.silenceHours)) {
    const size = sizes[`${key}-out`] || 0
    const prev = ctx.state.growth[key]
    if (!prev || prev.size !== size) ctx.state.growth[key] = { size, at: ctx.now }
    ctx.evaluated.add(`ops · collector · silent:${key}`)
    if (ctx.now - ctx.state.growth[key].at > hours * 3600000) ctx.obs.push(collector(`silent:${key}`))
  }
}

// ── C-6 디스크 ───────────────────────────────────────────────────────
function collectDisk(ctx) {
  for (const [fsName, p] of Object.entries(DISKS)) {
    ctx.evaluated.add(`ops · collector · disk-read:${fsName}`)
    let s
    try {
      s = fs.statfsSync(p)
    } catch {
      ctx.obs.push(collector(`disk-read:${fsName}`))
      continue
    }
    const used = s.blocks - s.bfree
    const pct = { usage: used + s.bavail > 0 ? (used * 100) / (used + s.bavail) : 0, inode: s.files > 0 ? ((s.files - s.ffree) * 100) / s.files : 0 }
    for (const [kind, v] of Object.entries(pct)) {
      ctx.evaluated.add(`host · ${fsName} · ${kind}`)
      const { warn, crit } = CONFIG.disk
      if (v >= crit) ctx.obs.push(observation('host', fsName, kind, [`>=${crit}`], '장애', 'state'))
      else if (v >= warn) ctx.obs.push(observation('host', fsName, kind, [`>=${warn}`], '경고', 'state'))
    }
  }
}

// ── 억제 · 복구 · 폭주 · 일일 요약(§1-3) ─────────────────────────────
function line(e, sev, extra = '') {
  const what = [e.app, e.role].join('·') + ' · ' + [e.src, ...e.detail].filter(Boolean).join(' · ')
  return `[ops] ${SEV[sev]} ${md(`${sev} · ${what} · 지문 ${e.fp}${extra}`)}`
}

const ALL_MISSING_NOTE =
  ' · pleiades 프로세스 6 모두 없음 — 데몬이 수집기 환경으로 다시 떴을 수 있다. resurrect 전에 데몬을 서비스 환경으로 다시 띄운다(런북 ops-collector 3절)'

const SEV_RANK = { 경고: 1, 실패: 2, 장애: 3 }
function merge(obs) {
  const byFp = new Map()
  for (const o of obs) {
    const fp = fpOf(o.material)
    const cur = byFp.get(fp)
    if (!cur) byFp.set(fp, { ...o, fp })
    else {
      cur.count += o.count
      if (SEV_RANK[o.sev] > SEV_RANK[cur.sev]) cur.sev = o.sev // 같은 지문 안에서는 높은 심각도(PR #569 Codex P2)
    }
  }
  return [...byFp.values()]
}

function entryFor(table, o, now) {
  const e = (table[o.fp] ||= { first: now, posted: null, pending: 0, open: false, ok: 0, days: {}, deferred: false })
  Object.assign(e, { fp: o.fp, material: o.material, app: o.app, role: o.role, src: o.src, detail: o.detail, sev: o.sev, kind: o.kind, scope: o.scope, last: now })
  return e
}

function plan(ctx) {
  const { state, now } = ctx
  const table = state.fps
  const today = kstDate(new Date(now))
  const active = new Set()
  const activeScopes = new Set()
  const fresh = []
  const posts = []
  for (const o of merge(ctx.obs)) {
    active.add(o.fp)
    if (o.scope) activeScopes.add(o.scope)
    const e = entryFor(table, o, now)
    e.days[today] = (e.days[today] || 0) + o.count
    e.ok = 0
    const wasDeferred = e.deferred
    const isNew = wasDeferred || (e.kind === 'state' ? !e.open : e.posted === null)
    if (e.kind === 'state') e.open = true
    if (isNew) {
      e.deferred = true // 게시가 끝나면 지운다 — 한 회 상한에 걸리면 다음 회에 첫 발생으로 다시 나간다
      e.pending = 0
      e.firstCount = (wasDeferred ? e.firstCount || 0 : 0) + o.count // 미뤄진 동안의 횟수를 잃지 않는다(PR #569 Codex P2)
      fresh.push({ e, count: e.firstCount })
    } else e.pending += o.count
  }
  // 미뤄진 첫 발생이 이번 회에 다시 관측되지 않았을 때(9-1 major):
  // 로그형은 그대로 다시 내보내고 · 상태형은 판정한 회에 이미 풀렸으면 알린 적 없는 이상이라 조용히 닫는다
  for (const e of Object.values(table)) {
    if (!e.deferred || active.has(e.fp)) continue
    if (e.kind === 'event') fresh.push({ e, count: e.firstCount || 1 })
    // 판정한 회에 풀렸거나 · 같은 scope 의 다른 지문이 대신 나간다
    else if (ctx.evaluated.has(e.scope) || activeScopes.has(e.scope)) Object.assign(e, { deferred: false, open: false, ok: 0, pending: 0 })
  }
  const special = fresh.filter((f) => f.e.src === 'all-missing')
  const normal = fresh.filter((f) => f.e.src !== 'all-missing')
  for (const f of special) posts.push(firstPost(f, ALL_MISSING_NOTE))
  if (normal.length > CONFIG.burstLimit) posts.push(burstPost(normal))
  else for (const f of normal) posts.push(firstPost(f, f.count > 1 ? ` · ${f.count}회` : ''))
  for (const e of Object.values(table)) {
    // 판정하지 못한 회(.env 읽기 실패 · 배포 보류)는 정상 연속을 끊는다 — 복구는 연속 M 회다(#577 · PR #576 Codex P2)
    if (e.kind === 'state' && e.open && !active.has(e.fp) && !ctx.evaluated.has(e.scope)) e.ok = 0
    if (e.kind === 'state' && e.open && !e.deferred && !active.has(e.fp) && activeScopes.has(e.scope)) {
      // 같은 scope 에서 세부만 바뀌었다(디스크 80→90 · 5xx→000 · errored→stopped) — 복구가 아니다. 새 지문이 따로 나간다(9-1 major)
      Object.assign(e, { open: false, ok: 0, pending: 0 })
    } else if (e.kind === 'state' && e.open && !e.deferred && e.posted !== null && !active.has(e.fp) && ctx.evaluated.has(e.scope)) {
      e.ok += 1
      if (e.ok >= CONFIG.recoverRuns) posts.push(recoverPost(e))
    } else if (e.pending > 0 && !e.deferred && now - e.posted >= CONFIG.repeatMin * MIN) posts.push(repeatPost(e))
  }
  const summary = summaryPost(ctx, today)
  if (summary) posts.push(summary)
  return posts
}

function firstPost({ e, count }, extra) {
  return { type: 'first', e, count, text: line(e, e.sev, extra), commit: (now) => Object.assign(e, { posted: now, deferred: false }) }
}
function repeatPost(e) {
  const count = e.pending
  return { type: 'repeat', e, count, text: line(e, e.sev, ` · 직전 게시 뒤 ${count}회`), commit: (now) => Object.assign(e, { posted: now, pending: 0 }) }
}
function recoverPost(e) {
  return { type: 'recover', e, count: 0, text: line(e, '복구'), commit: () => Object.assign(e, { open: false, ok: 0, pending: 0 }) }
}
function burstPost(list) {
  const by = {}
  for (const { e } of list) by[`${e.app}·${e.role}`] = (by[`${e.app}·${e.role}`] || 0) + 1
  const parts = Object.entries(by).map(([k, n]) => `${k} ${n}`).join(' · ')
  return {
    type: 'burst',
    e: null,
    count: list.length,
    text: `[ops] ${SEV.실패} ${md(`새 지문 ${CONFIG.burstLimit}+ (${list.length}) · ${parts}`)}`,
    commit: (now) => list.forEach(({ e }) => Object.assign(e, { posted: now, deferred: false })),
  }
}

function summaryPost(ctx, today) {
  const d = new Date(ctx.now)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (ctx.state.summaryDate === today || hm < CONFIG.summaryAt) return null
  const yesterday = kstDate(new Date(ctx.now - 86400000))
  const all = Object.values(ctx.state.fps)
  const open = all.filter((e) => e.kind === 'state' && e.open).map((e) => `${e.app}·${e.role}·${e.src} ${e.fp}`)
  const top = all
    .filter((e) => e.days[yesterday])
    .sort((a, b) => b.days[yesterday] - a.days[yesterday])
    .slice(0, 5)
    .map((e) => `${e.app}·${e.role}·${e.src} ${e.fp} ×${e.days[yesterday]}`)
  const text = `[ops] ${md(`일일 요약 · 살아 있음 · 열린 이상 ${open.length}${open.length ? ` (${open.slice(0, 10).join(' / ')})` : ''} · 어제 상위 ${top.length ? top.join(' / ') : '없음'}`)}`
  return { type: 'summary', e: null, count: open.length, text, commit: () => (ctx.state.summaryDate = today) }
}

// ── 상태 · 기록 · 잠금 ───────────────────────────────────────────────
const STATE = () => path.join(OPS_DIR, 'state.json') // .bak·.dump·.sql 이름을 쓰지 않는다(backup-check.sh 가 홈을 훑는다 · K-4)

function loadState() {
  const empty = { files: {}, fps: {}, restarts: {}, lastOk: {}, growth: {}, lastRunAt: null, summaryDate: null }
  let text
  try {
    text = fs.readFileSync(STATE(), 'utf8')
  } catch {
    return { state: empty, hadState: false, corrupt: false }
  }
  try {
    return { state: { ...empty, ...JSON.parse(text) }, hadState: true, corrupt: false }
  } catch {
    return { state: empty, hadState: false, corrupt: true } // 끝에서 시작한다(안전한 쪽)
  }
}

function prune(state, now) {
  const keep = now - CONFIG.retainDays * 86400000
  const days = new Set([kstDate(new Date(now)), kstDate(new Date(now - 86400000))])
  for (const [fp, e] of Object.entries(state.fps)) {
    if (!e.open && !e.deferred && e.last < keep) delete state.fps[fp]
    else for (const d of Object.keys(e.days)) if (!days.has(d)) delete e.days[d]
  }
  let text = JSON.stringify(state)
  const closed = Object.values(state.fps).filter((e) => !e.open && !e.deferred).sort((a, b) => a.last - b.last)
  while (Buffer.byteLength(text) > CONFIG.maxStateBytes && closed.length > 0) {
    delete state.fps[closed.shift().fp]
    text = JSON.stringify(state)
  }
  return text
}

function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, text, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

function appendLines(name, lines) {
  if (lines.length > 0) fs.appendFileSync(path.join(OPS_DIR, name), lines.join('\n') + '\n', { mode: 0o600 })
}

// 요약 이벤트 기록의 보존(P-5) — 하루 한 번(일일 요약 회)만 다시 쓴다
function pruneEvents(now) {
  const file = path.join(OPS_DIR, 'events.jsonl')
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return
  }
  const keep = now - CONFIG.retainDays * 86400000
  const lines = text.split('\n').filter((l) => {
    try {
      return l && JSON.parse(l).at >= keep
    } catch {
      return false
    }
  })
  writeAtomic(file, lines.length ? lines.join('\n') + '\n' : '')
}

function tryMkdir(dir) {
  try {
    fs.mkdirSync(dir)
    return true
  } catch (err) {
    if (err.code === 'EEXIST') return false
    throw err
  }
}

function statOrNull(p) {
  try {
    return fs.statSync(p)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

// 넘겨받기는 보조 잠금(<lock>.takeover) 안에서만 한다 — 두 실행이 같은 stale 잠금을 동시에 보면
// 하나만 지우고 다시 만든다. 다른 쪽은 보조 잠금을 못 잡아 busy 이거나, 잡은 뒤 다시 봐서 새 잠금이 신선하면 busy(#577 · PR #576 Codex P2).
// 보조 잠금도 같은 기준으로 stale 이면 치운다(넘겨받던 실행이 그 짧은 사이에 죽은 경우뿐이다).
// 남은 위험: stale 보조 잠금을 두 실행이 동시에 치우면 둘 다 들어갈 수 있다 — 넘겨받기 중 사망 + 동시 실행이 겹쳐야 한다(PR 9-1 info · 받아들인다).
function lockId(dir) {
  const st = fs.statSync(dir, { bigint: true })
  return `${st.ino}:${st.ctimeNs}` // inode 번호는 rmdir 직후 mkdir 에 다시 쓰일 수 있다 — 생성 시각을 함께 본다(9-1 info)
}

function acquireLock(lock) {
  if (tryMkdir(lock)) return { status: 'ok', id: lockId(lock) }
  const staleMs = CONFIG.lockStaleRuns * CONFIG.periodMin * MIN
  const isFresh = (st) => st !== null && Date.now() - st.mtimeMs < staleMs
  if (isFresh(statOrNull(lock))) return { status: 'busy' }
  const guard = `${lock}.takeover`
  if (!tryMkdir(guard)) {
    if (isFresh(statOrNull(guard))) return { status: 'busy' }
    try {
      fs.rmdirSync(guard)
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    if (!tryMkdir(guard)) return { status: 'busy' }
  }
  try {
    const st = statOrNull(lock)
    if (isFresh(st)) return { status: 'busy' } // 다른 실행이 먼저 넘겨받았다
    if (st !== null) fs.rmdirSync(lock)
    if (!tryMkdir(lock)) return { status: 'busy' }
    return { status: st === null ? 'ok' : 'stale', id: lockId(lock) }
  } finally {
    try {
      fs.rmdirSync(guard)
    } catch {
      // 이미 없다 — 다음 실행이 stale 기준으로 다룬다
    }
  }
}

// 자기가 만든 잠금일 때만 지운다 — 넘겨받힌 뒤 남의 잠금을 지우지 않는다(#577)
function releaseLock(lock, id) {
  try {
    if (lockId(lock) === id) fs.rmdirSync(lock)
  } catch {
    // 이미 없다 — 결과를 실패로 바꾸지 않는다
  }
}

// ── 실행 ─────────────────────────────────────────────────────────────
function deliver(posts, ctx) {
  const deadline = ctx.started + CONFIG.maxRunMs
  const stamp = kstMinute(new Date(ctx.now))
  const out = []
  const events = []
  let deferred = 0
  for (const p of posts) {
    if (Date.now() >= deadline) {
      deferred += 1 // commit 하지 않는다 — 상태가 다음 회에 다시 고른다(P-9)
      continue
    }
    out.push(`${stamp} ${p.text}`) // dry-run: 게시 대신 기록 · 템플릿 + 허용 칸뿐이다
    p.commit(ctx.now)
    const e = p.e || {}
    events.push(JSON.stringify({ at: ctx.now, type: p.type, fp: e.fp || null, app: e.app || null, role: e.role || null, src: e.src || null, sev: e.sev || null, count: p.count }))
  }
  appendLines('dry-run.log', out)
  return { events, posted: out.length, deferred }
}

async function collect(ctx, pm2Bin) {
  const late = ctx.state.lastRunAt !== null && ctx.now - ctx.state.lastRunAt > CONFIG.lateRuns * CONFIG.periodMin * MIN
  if (late) ctx.obs.push(collector('late', 'event'))
  ctx.deploy = deployWindow(ctx)
  await collectPm2(ctx, pm2Bin)
  await collectHealth(ctx)
  collectLogs(ctx)
  collectDisk(ctx)
}

async function run(pm2Bin) {
  if (CONFIG.lockStaleRuns * CONFIG.periodMin * MIN <= CONFIG.maxRunMs) {
    console.error('collect.cjs: 설정 오류 — P-8×주기 > P-9 가 아니다')
    return 2
  }
  fs.mkdirSync(OPS_DIR, { recursive: true, mode: 0o700 })
  fs.chmodSync(OPS_DIR, 0o700)
  const lock = path.join(OPS_DIR, 'collect.lock')
  const got = acquireLock(lock)
  const nowDate = TEST && process.env.OPS_NOW ? new Date(process.env.OPS_NOW) : new Date()
  if (got.status === 'busy') {
    console.log(`${kstMinute(nowDate)} 건너뜀 — 이전 실행이 아직 돈다`)
    return 1
  }
  try {
    const { state, hadState, corrupt } = loadState()
    const ctx = { state, hadState, now: nowDate.getTime(), started: Date.now(), obs: [], evaluated: new Set(), parseFail: {} }
    if (got.status === 'stale') ctx.obs.push(collector('lock-stale', 'event'))
    if (corrupt) ctx.obs.push(collector('state-parse', 'event'))
    await collect(ctx, pm2Bin)
    const posts = plan(ctx)
    const summaryRun = posts.some((p) => p.type === 'summary')
    const r = deliver(posts, ctx)
    const obsLines = merge(ctx.obs).map((o) => JSON.stringify({ at: ctx.now, type: 'obs', fp: o.fp, app: o.app, role: o.role, src: o.src, sev: o.sev, count: o.count }))
    appendLines('events.jsonl', [...obsLines, ...r.events])
    if (summaryRun && state.summaryDate === kstDate(nowDate)) pruneEvents(ctx.now)
    state.lastRunAt = ctx.now
    writeAtomic(STATE(), prune(state, ctx.now))
    console.log(`${kstMinute(nowDate)} 수집 통과 · 관측 ${obsLines.length} · 기록 ${r.posted} · 미룸 ${r.deferred} (dry-run)`)
    return 0
  } finally {
    releaseLock(lock, got.id)
  }
}

function parseArgs(argv) {
  let dry = false
  let pm2Bin = path.join(path.dirname(path.dirname(process.execPath)), 'lib', 'node_modules', 'pm2', 'bin', 'pm2') // npm 전역 기본 위치(V16)
  for (const a of argv) {
    if (a === '--dry-run') dry = true
    else if (a.startsWith('--pm2-bin=')) pm2Bin = a.slice('--pm2-bin='.length)
    else return null
  }
  return { dry, pm2Bin }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args) {
    console.error('사용법: node collect.cjs --dry-run [--pm2-bin=<절대 경로>]')
    return 2
  }
  if (!args.dry) {
    console.error('collect.cjs: 게시는 아직 없다(PR-2) — --dry-run 만')
    return 2
  }
  if (process.platform === 'darwin' && !TEST) {
    console.error('collect.cjs: 중단 — 서버 전용이다(I-3)')
    return 1
  }
  process.umask(0o077)
  return run(args.pm2Bin)
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.log(`결과: 실패 — 예외 ${errCode(err)}`) // 메시지에 경로가 실릴 수 있어 코드만
    process.exit(1)
  },
)
