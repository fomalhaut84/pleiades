#!/usr/bin/env node
// collect.cjs — 008 단계 1 수집기 (#568 · 설계 008 §2 확정 블록 · 세부 _workspace/250/02_writer_stage1_r2.md).
//
// 사용:  node collect.cjs [--dry-run] [--pm2-bin=<절대 경로>]   수집 1회(crontab 이 부른다)
//        node collect.cjs --test-alert                             설치 시험 — 고정 문구 1건을 게시 경로로(런북 4절)
//
// 게시(PR-2b · #725): 플랫폼 설정의 DISCORD_WEBHOOK_OPS 로 Discord #ops 에 보낸다(폴백 없음) · 보낸 본문은 posted.log.
// --dry-run 은 외부로 나가는 것이 0 이다 — 게시할 메시지는 상태 디렉터리의 dry-run.log 에 쓴다(PR-1 판과 같다).
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
  // #713(#622 재판정): bot 역할은 끈다 — 연결은 생존 표지(#589)가 본다 · fin-mcp 72h — 주말엔 fin AI 호출이 없어 24h 넘게 그대로였다(오탐 275)
  silenceHours: { 'fin-mcp': 72, 'fit-web': 24, 'fit-mcp': 24 },
  // #713(사용자 2026-11-16) — 경고 등급은 일일 요약에만: 첫 발생·반복·복구를 기록(게시)하지 않고 조용히 처리한다 · 폭주 수에서 뺀다
  quietWarnings: true,
  // #589 봇 생존 표지 — apps/<dir>/logs/alive-<app>.json 수정 시각이 N분 넘게 그대로면 gateway 정지(chat 이 READY·RESUMED 는 곧바로 · ACK 는 60초에 한 번 쓴다)
  // 보는 것은 "Discord 연결 유지"다 — 연결은 살아 있는데 답을 못 하는 경우(4014 강등 · 핸들러·AI 정지)는 잡지 않는다
  aliveStaleMin: 10,
  // 014 H-3(#802) hermes 상태 파일 — hermes 는 10초마다 · 결과가 바뀌면 바로 쓴다. 갱신이 N분 멈추면 장애 · 가장 오래된 queued 가 M분이면 적체
  hrmStaleMin: 5,
  hrmBacklogMin: 30,
  readCapBytes: 4 * 1048576, // 한 파일을 한 회에 읽는 상한 — 남은 것은 다음 회
  socketMs: 2000,
  jlistMs: 20000,
  httpMs: 5000,
  postGapMs: 500, // 한 회 안 게시 사이 간격(#725)
}
const CONFIG = TEST && process.env.OPS_CONFIG ? { ...DEFAULTS, ...JSON.parse(process.env.OPS_CONFIG) } : DEFAULTS
const MIN = 60000

// 도메인 앱 — .env · health · glob-empty · 침묵 · all-missing 은 이 둘만 본다
const APPS = {
  fin: path.join(HOME, 'pleiades-fin', 'apps', 'finance'),
  fit: path.join(HOME, 'pleiades-fit', 'apps', 'fitness'),
}
const ROLES = ['web', 'bot', 'mcp']
// 곁가지 앱 — 자기 체크아웃 · 자기 수동 배포 스크립트가 쓰는 표지(inplace-<앱>-last-ok · -stopped)로 감시 여부를 정한다
//   adv = 통합 층(012 4b-3c · #704 · deploy/advisor/adv-inplace.sh) · 봇 하나
//   hrm = hermes(014 H-3 · #802 · deploy/hermes/hrm-inplace.sh) · api 하나 · gateway 봇이 아니다(생존 표지 없음 · 상태 파일로 본다)
const ADV_DIR = path.join(HOME, 'pleiades-adv', 'apps', 'advisor')
const HRM_DIR = path.join(HOME, 'pleiades-hermes', 'apps', 'hermes')
const SIDE_APPS = ['adv', 'hrm']
const APP_DIRS = { ...APPS, adv: ADV_DIR, hrm: HRM_DIR }
const ROLES_OF = { fin: ROLES, fit: ROLES, adv: ['bot'], hrm: ['api'] }
// hermes 상태 파일 — deploy/hermes/pleiades-hrm.config.cjs HERMES_STATE_DIR 와 같은 자리(체크아웃 밖) · 수치만 들어 있다
const HRM_STATE = path.join(HOME, 'pleiades-hermes-data', 'state', 'state.json')
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
  { re: /Failed to find Server Action/, kind: 'server-action-ref', sev: '경고' }, // 같은 스캐너의 다른 문구(#622 재판정 · 하루 16건 · #713)
  { re: /\[auth\]\[error\].*\bUnknownAction\b/, kind: 'auth-unknown-action', sev: '경고' }, // 스캐너의 /api/auth/* 탐색 — Auth.js 가 없는 동작을 거부(#713)
  { re: /The width\(-?\d+\) and height\(-?\d+\) of chart should be greater than 0/, kind: 'chart-size', sev: '경고' }, // Recharts · #588
  // hermes 상태 전환 줄(#802) — 같은 사실을 상태 파일 판정(웹훅 · 레지스트리)이 상태형으로 본다 · 줄은 겹치지 않게 경고로만
  { re: /^\[hermes\] 게시 멈춤/, kind: 'hermes-paused', sev: '경고' },
  { re: /^\[hermes\] 레지스트리 오류/, kind: 'hermes-registry', sev: '경고' },
]
const PM2_PREFIX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}: / // pleiades.config.cjs log_date_format + pm2 의 ': '
const ANSI = /\x1b\[[0-9;]*m/g // Auth.js 등은 색 코드로 줄을 시작한다 — 판정 전에 벗긴다(#713)
const STACK_LINE = /^\s+at /
const LOG_NAME = /^pleiades-(fin|fit|adv|hrm)-(web|bot|mcp|api)-(out|error)(?:-\d+)?\.log$/ // 앱·역할 조합은 ROLES_OF · 활성 집합이 거른다
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
  const expected = ctx.active.flatMap((a) => ROLES_OF[a].map((r) => [a, r]))
  evaluated.add('ops · pm2 · all-missing')
  // 두 앱 6 개만 — adv 하나가 살아 있어도 두 앱이 다 없으면 resurrect 신호다(4b-3 정정 3)
  if (Object.keys(APPS).every((a) => ROLES.every((r) => !procs[`pleiades-${a}-${r}`]))) {
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
  for (const app of ctx.active) {
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
  let prevAt
  for (const { at, lines: raw } of chunksOf(lines)) {
    const chunk = raw.map((l) => l.replace(ANSI, ''))
    const head = chunk[0]
    // 같은 초에 스택 줄로 시작하는 덩어리 = 앞 덩어리의 연속(따로 쓴 스택에 pm2 가 시각을 따로 붙였다 · Auth.js · #713) — 앞에서 셌다
    const continued = at !== null && at === prevAt && STACK_LINE.test(head)
    prevAt = at
    if (continued || !head.trim() || NORMAL_GATEWAY.test(head)) continue
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
    // 활성 집합 밖 앱(정지 · 첫 배포 전 adv) · 그 앱에 없는 역할은 읽지도 오프셋을 남기지도 않는다(4b-3 R2-3)
    if (!ctx.active.includes(app) || !ROLES_OF[app].includes(role)) {
      delete ctx.state.files[name]
      continue
    }
    let st
    try {
      st = fs.statSync(path.join(dir, name))
    } catch {
      continue
    }
    seen[key] = true
    sizes[key] = (sizes[key] || 0) + st.size
    if (stream === 'out' && role !== 'mcp') continue // web·bot -out 은 침묵 감지(C-7 ②)에만 · adv · hrm 로그(stdout)는 읽지 않는다
    // 비활성 → 활성으로 바뀐 회 — 끝에서 시작한다(정지 동안 쌓인 줄이 한꺼번에 나오지 않게 · 4b-3 r4 보충 2 · PR #590 첫 회와 같다)
    if (ctx.reactivated.has(app)) {
      ctx.state.files[name] = { ino: st.ino, off: st.size }
      continue
    }
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
  for (const app of Object.keys(APPS)) { // 도메인 앱만 — adv 는 크래시 때만 -error 가 생긴다
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

// ── #589 봇 생존 표지 ────────────────────────────────────────────────
// 수정 시각만 본다(내용은 읽지 않는다) · 파일이 없으면 정상으로 본다(릴리즈 전 · Discord 미설정 · 일부러 지운 표지 —
// 열려 있던 stale 은 복구로 닫힌다 · #589 9-1 major) · 배포 보류 중에는 판정하지 않는다
function collectAlive(ctx) {
  for (const app of ctx.active) {
    if (!ROLES_OF[app].includes('bot')) continue // hrm 은 gateway 봇이 아니다(#802)
    if (ctx.deploy[app].held) continue
    ctx.evaluated.add(`ops · collector · alive-read:${app}`)
    let st
    try {
      st = fs.statSync(path.join(APP_DIRS[app], 'logs', `alive-${app}.json`))
    } catch (e) {
      // 읽지 못한 회는 gateway 를 판정하지 않는다 — 열린 stale 을 거짓 복구로 닫지 않는다(PR #591 Codex P2)
      if (e && e.code === 'ENOENT') ctx.evaluated.add(`${app} · bot · gateway`)
      else ctx.obs.push(collector(`alive-read:${app}`))
      continue
    }
    ctx.evaluated.add(`${app} · bot · gateway`)
    if (ctx.now - st.mtimeMs > CONFIG.aliveStaleMin * MIN) ctx.obs.push(observation(app, 'bot', 'gateway', ['stale'], '장애', 'state'))
  }
}

// ── 014 H-3 hermes 상태 파일(#802 · §3-G) ─────────────────────────────
// 상태형: 갱신 멈춤 · 레지스트리 오류(장애) · 웹훅 없음 / 비밀 재료 멈춤 · 적체(실패) · 만료 임박(경고 → 요약)
// 로그형: dead 증가(실패) · 차단 · 링크 뺌(경고 → 요약) — 기준값은 state.hrm(오늘 수치는 날이 바뀌면 0 부터)
// 파일은 수치만 담는다 — 출처 id 만 칸에 쓴다(허용 문자 칸 · §1-4 ⓪)
function collectHermes(ctx) {
  if (!ctx.active.includes('hrm') || ctx.deploy.hrm.held) return
  ctx.evaluated.add('ops · collector · hrm-state-read')
  let st
  try {
    st = JSON.parse(fs.readFileSync(HRM_STATE, 'utf8'))
    if (!st || typeof st !== 'object' || Array.isArray(st)) throw new Error('shape')
  } catch {
    ctx.obs.push(collector('hrm-state-read')) // 읽지 못한 회는 상태를 판정하지 않는다(열린 기록을 거짓 복구로 닫지 않게)
    return
  }
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  const push = (src, detail, sev, kind = 'state', count = 1) => ctx.obs.push(observation('hrm', 'api', src, detail, sev, kind, count))
  for (const src of ['state', 'registry', 'webhook', 'queue', 'expiry']) ctx.evaluated.add(`hrm · api · ${src}`)
  const updated = Date.parse(st.updatedAt)
  if (!Number.isFinite(updated) || ctx.now - updated > CONFIG.hrmStaleMin * MIN) push('state', ['stale'], '장애')
  if (st.registryError === true) push('registry', ['error'], '장애')
  if (st.paused === 'secrets') push('webhook', ['secrets'], '실패')
  else if (st.webhook !== true || st.paused === 'webhook') push('webhook', ['none'], '실패')
  const oldest = Date.parse(st.oldestQueuedAt)
  if (num(st.queued) > 0 && Number.isFinite(oldest) && ctx.now - oldest > CONFIG.hrmBacklogMin * MIN) push('queue', ['backlog'], '실패')
  for (const id of Array.isArray(st.expiringSoon) ? st.expiringSoon : []) if (field(id)) push('expiry', [field(id)], '경고')

  const day = kstDate(new Date(ctx.now))
  const prev = ctx.state.hrm || null
  const cur = { day, dead: num(st.dead), blocked: num(st.blockedToday), linkDropped: num(st.linkDroppedToday) }
  // 첫 회 · 정지 뒤 다시 켠 회는 기준값만 남긴다(정지 동안의 변화를 한꺼번에 내지 않게 · 로그의 끝에서 시작과 같다)
  if (prev && !ctx.reactivated.has('hrm')) {
    if (cur.dead > prev.dead) push('dead', [], '실패', 'event', cur.dead - prev.dead)
    const base = (k) => (prev.day === day ? prev[k] : 0)
    if (cur.blocked > base('blocked')) push('blocked', [], '경고', 'event', cur.blocked - base('blocked'))
    if (cur.linkDropped > base('linkDropped')) push('link-dropped', [], '경고', 'event', cur.linkDropped - base('linkDropped'))
  }
  ctx.state.hrm = cur
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
    const warn = o.sev === '경고' ? o.count : 0 // 요약의 경고 개수는 관측 심각도로 센다(합친 뒤 높은 심각도가 아니라 · PR #714 Codex P2)
    if (!cur) byFp.set(fp, { ...o, fp, warn })
    else {
      cur.count += o.count
      cur.warn += warn
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
    const prevSev = table[o.fp] && table[o.fp].deferred ? table[o.fp].sev : undefined
    const e = entryFor(table, o, now)
    // 미뤄진 첫 발생은 아직 보내지 못했다 — 같은 지문의 더 낮은 심각도가 덮으면 실패가 조용한 경고로 commit 된다(#731 · PR #730 Codex P2)
    if (prevSev) e.sev = higherSev(prevSev, o.sev)
    e.days[today] = (e.days[today] || 0) + o.count
    if (o.warn) (e.warnDays ||= {})[today] = (e.warnDays[today] || 0) + o.warn
    e.ok = 0
    const wasDeferred = e.deferred
    // 조용히 처리한 지문에 경고보다 높은 심각도가 오면 첫 발생으로 낸다 — 지문 재료에 심각도가 없어 늦거나 묻혔다(PR-2a 9-1 major)
    const louder = CONFIG.quietWarnings && e.postedQuiet === true && o.sev !== '경고'
    const isNew = wasDeferred || louder || (e.kind === 'state' ? !e.open : e.posted === null)
    if (e.kind === 'state') e.open = true
    if (isNew) {
      e.deferred = true // 게시가 끝나면 지운다 — 한 회 상한에 걸리면 다음 회에 첫 발생으로 다시 나간다
      e.pending = 0
      e.pendingSev = undefined
      e.firstCount = (wasDeferred ? e.firstCount || 0 : 0) + o.count // 미뤄진 동안의 횟수를 잃지 않는다(PR #569 Codex P2)
      fresh.push({ e, count: e.firstCount })
    } else {
      e.pending += o.count
      e.pendingSev = higherSev(e.pendingSev, o.sev) // 반복 게시·조용히 여부는 쌓인 것 중 최고로 판정한다
    }
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
  const quiet = fresh.filter((f) => f.e.src !== 'all-missing' && isQuiet(f.e))
  const normal = fresh.filter((f) => f.e.src !== 'all-missing' && !isQuiet(f.e))
  for (const f of special) posts.push(firstPost(f, ALL_MISSING_NOTE))
  for (const f of quiet) posts.push(firstPost(f, f.count > 1 ? ` · ${f.count}회` : '')) // deliver 가 조용히 처리한다
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

// 경고는 일일 요약에만(#713) — 게시 대상(첫 발생 · 반복 · 복구)이어도 deliver 가 기록하지 않고 상태만 넘긴다
const isQuiet = (e) => CONFIG.quietWarnings && e && e.sev === '경고'
const higherSev = (a, b) => (!a || SEV_RANK[b] > SEV_RANK[a] ? b : a)
// 게시 하나가 조용한가 — 첫 발생은 이번 심각도 · 반복은 쌓인 것 중 최고 · 복구는 그 이상을 조용히 냈을 때만(9-1 major)
function quietPost(p) {
  if (!CONFIG.quietWarnings || !p.e) return false
  if (p.type === 'first') return p.e.sev === '경고'
  if (p.type === 'repeat') return (p.e.pendingSev || p.e.sev) === '경고'
  if (p.type === 'recover') return p.e.postedQuiet === true
  return false
}

function firstPost({ e, count }, extra) {
  return { type: 'first', e, count, text: line(e, e.sev, extra), commit: (now) => Object.assign(e, { posted: now, deferred: false }) }
}
function repeatPost(e) {
  const count = e.pending
  return { type: 'repeat', e, count, text: line(e, e.pendingSev || e.sev, ` · 직전 게시 뒤 ${count}회`), commit: (now) => Object.assign(e, { posted: now, pending: 0 }) }
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
    // 폭주로 나간 지문도 조용함 표지를 지운다 — 남으면 다음 회마다 "더 높은 심각도" 로 다시 폭주했다(PR #714 Codex P2)
    commit: (now) => list.forEach(({ e }) => Object.assign(e, { posted: now, deferred: false, postedQuiet: false, pendingSev: undefined })),
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
  const warned = all.filter((e) => (e.warnDays || {})[yesterday])
  const warnTotal = warned.reduce((n, e) => n + e.warnDays[yesterday], 0)
  const warnPart = CONFIG.quietWarnings ? ` · 경고 어제 ${warned.length}종 ${warnTotal}회` : ''
  const text = `[ops] ${md(`일일 요약 · 살아 있음 · 열린 이상 ${open.length}${open.length ? ` (${open.slice(0, 10).join(' / ')})` : ''}${warnPart} · 어제 상위 ${top.length ? top.join(' / ') : '없음'}`)}`
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
    else for (const t of [e.days, e.warnDays || {}]) for (const d of Object.keys(t)) if (!days.has(d)) delete t[d]
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

// ── 게시 · 게시 전 검사(§1-4 ⓪~③ · PR-2b #725) ─────────────────────────
// ⓪ 칸 허용 문자는 관측을 만들 때 이미 거쳤다(field · FIELD_OK). 여기서는 완성된 본문에 ①~③ 을 건다.
// 걸리면 본문 대신 고정 문구(지문 · 사유 코드만)를 보낸다 — 재작성 재시도 없음(008 §5-1 · 우회 학습 경로).
const POST_MAX = 2000 // ③ Discord 메시지 한 건 상한
const SECRET_MIN = 8 // P-10 비밀 대조 최소 길이 — 짧은 값은 템플릿 문구·숫자와 우연히 맞는다(거짓 차단)
// ① 대조할 키 — 비밀인 것만(PORT · NODE_ENV · 채널·사용자 ID 같은 비밀 아닌 값은 대조하지 않는다 · 거짓 차단)
// 서버 템플릿 키 전수(deploy/env/*.template · 루트 .env.example)와 대조해 정했다(#725) — 시험이 두 목록을 함께 본다
const SECRET_KEY = /TOKEN|SECRET|PASSWORD|EMAIL|WEBHOOK|_KEY(?:_|$)|_PIN$|^DATABASE_URL$/ // 접미가 붙는 키가 있다(DISCORD_BOT_TOKEN_FINANCE)
const W = 'A-Za-z0-9_'
// ② 토큰 형식 — tools/ops/promote_check.py 의 TOKEN 패턴을 옮긴 것이다. 두 판은 tools/ops/token_vectors.json 을 함께 시험한다
const TOKEN_RES = [
  new RegExp(`(?<![${W}])(?:bot)?\\d{6,}:[A-Za-z0-9_-]{30,}`), // 옛 채널 봇 토큰
  new RegExp(`(?<![${W}-])[MNO][A-Za-z\\d_-]{20,}\\.[A-Za-z\\d_-]{5,}\\.[A-Za-z\\d_-]{25,}`), // Discord 봇
  new RegExp(`(?<![${W}-])eyJ[${W}-]{10,}\\.[${W}-]{10,}\\.[${W}-]{10,}`), // JWT
  new RegExp(`(?<![${W}])(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[${W}]{20,})`),
  new RegExp(`(?<![${W}-])sk-[A-Za-z0-9_-]{20,}`),
  new RegExp(`(?<![${W}])AKIA[0-9A-Z]{16}(?![${W}])`),
  new RegExp(`(?<![${W}])xox[abposr]-[A-Za-z0-9-]{4,}`),
  /\/(?:webhooks|interactions)\/[^/\s]*\/[A-Za-z0-9_-]{20,}/,
]
const GENERIC_TOKEN = new RegExp(`(?<![${W}-])[${W}-]{32,}(?![${W}-])`, 'g')
const MIN_TOKEN_PIECE = 16 // promote_check.py 와 같다 — 하이픈 파일 이름 제외
const isGenericToken = (s) =>
  !/^[0-9a-fA-F]+$/.test(s) && /\d/.test(s) && /[A-Za-z]/.test(s) && Math.max(...s.split(/[-_]/).map((p) => p.length)) >= MIN_TOKEN_PIECE
const hasToken = (s) => TOKEN_RES.some((re) => re.test(s)) || [...s.matchAll(GENERIC_TOKEN)].some((m) => isGenericToken(m[0]))
const unescapeMd = (s) => s.replace(/\\(.)/g, '$1') // md() 가 넣은 \ 가 값을 끊는다 — 대조는 벗긴 본문으로도 한다

// 게시 본문 검사 — null = 통과 · 아니면 사유 코드
function checkPost(text, secrets) {
  if (text.length > POST_MAX) return 'length'
  const plain = unescapeMd(text)
  if (hasToken(text) || hasToken(plain)) return 'token'
  if (secrets.some((v) => text.includes(v) || plain.includes(v))) return 'secret-match'
  return null
}

const blockedText = (p, code) => `[ops] 게시 차단 · ${p.e ? `지문 ${p.e.fp}` : p.type} · 사유 ${code}`

function platformFile() {
  return process.env.PLEIADES_ENV_FILE || (TEST ? '' : path.join(HOME, 'pleiades-platform.env')) // notify-deploy.cjs 와 같은 위치
}

// ① 의 재료와 웹훅 — 두 앱 .env + 플랫폼 설정. 값은 메모리에만 둔다(파일·출력에 쓰지 않는다).
// 하나라도 못 읽으면 ok=false(fail-closed) — 그래도 웹훅은 돌려준다(본문 없는 고정 문구를 보낼 수 있게)
function loadSecrets() {
  const dotenv = dotenvFor('fin')
  // 해석기가 없으면 웹훅도 못 읽는다 — "웹훅 없음" 으로 오진하지 않게 사유를 따로 낸다(PR-2b 9-1 major)
  if (!dotenv) return { ok: false, values: [], webhook: '', why: 'dotenv 없음' }
  const read = (file) => {
    try {
      return file ? dotenv.parse(fs.readFileSync(file)) : null
    } catch {
      return null
    }
  }
  const platform = read(platformFile())
  const envs = [...Object.values(APPS).map((dir) => read(path.join(dir, '.env'))), platform]
  const raw = (platform && platform.DISCORD_WEBHOOK_OPS) || ''
  const webhook = /^https:\/\//.test(raw) ? raw : '' // 잘못 넣은 값으로 본문이 다른 곳에 가지 않게 — https 만
  const missing = raw ? '웹훅 형식 오류' : '웹훅 없음'
  if (envs.some((e) => e === null)) return { ok: false, values: [], webhook, why: webhook ? '비밀 읽기 실패' : missing }
  const values = new Set()
  for (const env of envs) for (const [k, v] of Object.entries(env)) if (SECRET_KEY.test(k) && v.length >= SECRET_MIN) values.add(v)
  return { ok: true, values: [...values], webhook, why: webhook ? '' : missing }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// 요청 하나의 상한 — 느린 응답 하나가 한 회 예산(P-9)을 다 쓰지 않게
const postMs = (deadline) => Math.min(CONFIG.httpMs * 2, deadline - Date.now())

async function postWebhook(url, content, ms) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, ms))
  try {
    // wait=true — 없으면 Discord 가 저장하지 못한 메시지에도 성공으로 답한다(commit 이 앞서 재시도를 잃는다 · PR #726 Codex P2)
    const target = new URL(url)
    target.searchParams.set('wait', 'true')
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      signal: ctrl.signal,
    })
    if (res.body && typeof res.body.cancel === 'function') await res.body.cancel().catch(() => {})
    return res.ok ? null : `HTTP ${res.status}`
  } catch (err) {
    return err && typeof err.name === 'string' && /^[A-Za-z]{1,32}$/.test(err.name) ? err.name : 'error' // 메시지에 웹훅 URL 이 실릴 수 있다 — 이름만
  } finally {
    clearTimeout(timer)
  }
}

// ── 실행 ─────────────────────────────────────────────────────────────
// 게시 실패(웹훅 없음 · 비밀 못 읽음 · 네트워크 · HTTP) = 미룸 — commit 하지 않으면 상태가 다음 회에 다시 고른다(P-9 와 같은 길)
async function deliver(posts, ctx, live) {
  const deadline = ctx.started + CONFIG.maxRunMs
  const stamp = kstMinute(new Date(ctx.now))
  const out = []
  const events = []
  const r = { deferred: 0, quiet: 0, blocked: 0, why: '' }
  const sec = live ? loadSecrets() : null
  if (live) r.why = sec.why
  let sentAny = false
  for (const p of posts) {
    const silent = quietPost(p)
    if (!silent && (Date.now() >= deadline || r.why)) {
      r.deferred += 1
      continue
    }
    let blocked = null
    if (silent) r.quiet += 1 // 요약에만 — 기록하지 않고 상태만 넘긴다(미뤄진 채 남지 않게 commit 은 한다)
    else if (!live) out.push(`${stamp} ${p.text}`) // dry-run: 게시 대신 기록 · 템플릿 + 허용 칸뿐이다
    else {
      if (sentAny) await sleep(CONFIG.postGapMs) // 웹훅 속도 제한(약 5건/2초)에 연달아 걸리지 않게
      sentAny = true
      blocked = checkPost(p.text, sec.values)
      let text = blocked ? blockedText(p, blocked) : p.text
      let err = await postWebhook(sec.webhook, text, postMs(deadline))
      if (!blocked && /^HTTP (400|413)$/.test(err || '')) {
        // 본문 때문에 거절됐다 — 미루면 같은 글이 매 회 맨 앞에서 막아 요약까지 멈춘다(9-1 info) · 고정 문구로 바꿔 한 번
        blocked = 'rejected'
        text = blockedText(p, blocked)
        err = await postWebhook(sec.webhook, text, postMs(deadline))
      }
      if (err) {
        r.why = `게시 실패 ${err}` // 남은 것은 이번 회에 보내지 않는다(429 · 장애에 연달아 두드리지 않는다)
        r.deferred += 1
        continue
      }
      if (blocked) r.blocked += 1
      out.push(`${stamp} ${text}`) // 보낸 그대로(검사를 통과한 본문 또는 고정 문구)
    }
    p.commit(ctx.now)
    const sev = p.e ? (p.type === 'repeat' && p.e.pendingSev) || p.e.sev : null // 반복은 본문과 같은 심각도로 기록한다(#731 9-1 info)
    if (p.e && (p.type === 'first' || p.type === 'repeat')) Object.assign(p.e, { postedQuiet: silent, pendingSev: undefined })
    const e = p.e || {}
    events.push(JSON.stringify({ at: ctx.now, type: p.type, fp: e.fp || null, app: e.app || null, role: e.role || null, src: e.src || null, sev: sev || null, count: p.count, ...(silent ? { quiet: true } : {}), ...(blocked ? { blocked } : {}) }))
  }
  if (live && sec.webhook && !sec.ok && r.deferred > 0) await secretLoadNotice(ctx, sec.webhook, r.deferred, deadline)
  appendLines(live ? 'posted.log' : 'dry-run.log', out)
  return { events, posted: out.length, ...r }
}

// 비밀을 못 읽는 동안 게시가 멈췄다는 것만 알린다 — 본문 없는 고정 문구라 ① 없이 보낼 수 있다 · P-1 간격으로 한 번
async function secretLoadNotice(ctx, webhook, deferred, deadline) {
  if (ctx.now - (ctx.state.secretNoticeAt || 0) < CONFIG.repeatMin * MIN) return
  const err = await postWebhook(webhook, `[ops] 게시 보류 · 사유 secret-load · 미룸 ${deferred}`, postMs(deadline))
  if (!err) ctx.state.secretNoticeAt = ctx.now
}

// 설치 시험(런북 4절) — 수집 없이 고정 문구 1건을 같은 검사·같은 경로로 보낸다. 상태 파일을 건드리지 않는다
async function testAlert() {
  const sec = loadSecrets()
  const hint = { '웹훅 없음': ' — 플랫폼 설정의 DISCORD_WEBHOOK_OPS', '웹훅 형식 오류': ' — https:// 로 시작해야 한다', '비밀 읽기 실패': ' — 두 앱 .env · 플랫폼 설정을 모두 읽어야 게시한다', 'dotenv 없음': ' — 두 앱 체크아웃의 node_modules 를 확인한다' }
  if (sec.why) return fail(sec.why + (hint[sec.why] || ''))
  const text = `[ops] ${SEV.복구} ${md(`시험 · 수집기 게시 경로 확인 · ${kstMinute(new Date())}`)}`
  const blocked = checkPost(text, sec.values)
  if (blocked) return fail(`검사 차단 ${blocked} — 시험 문구가 비밀 값과 겹친다`)
  const err = await postWebhook(sec.webhook, text, CONFIG.httpMs * 2)
  if (err) return fail(`게시 실패 ${err}`)
  console.log('시험 게시 통과 — #ops 에 시험 문구 1건')
  return 0
  function fail(why) {
    console.log(`시험 게시 실패 — ${why}`)
    return 1
  }
}

// 이번 회에 감시하는 앱 — 한 회에 한 번만 정하고 모든 판정이 이것만 쓴다(4b-3 R2-3).
// 곁가지 앱(adv · hrm) = 수동 배포가 한 번이라도 통과했고(last-ok) 정지 표지가 없을 때. 표지를 못 읽으면 없는 것으로 본다(감시 밖 ·
// 안전한 쪽은 아니지만 비공개 위치를 못 읽는 회는 두 앱 판정도 deploy-stale·collector 경고로 드러난다)
function activeApps(ctx) {
  const on = (a) => fs.existsSync(path.join(PRIVATE, `inplace-${a}-last-ok`)) && !fs.existsSync(path.join(PRIVATE, `inplace-${a}-stopped`))
  const active = [...Object.keys(APPS), ...SIDE_APPS.filter(on)]
  const prev = ctx.state.active || Object.keys(APPS)
  ctx.reactivated = new Set(ctx.hadState ? active.filter((a) => !prev.includes(a)) : [])
  // 감시에서 빠진 앱(정지)의 열린 상태형 기록은 조용히 닫는다 — 판정하지 않는 scope 라 복구가 영영 안 나고 요약의 "열린 이상" 에
  // 날마다 남았다 · 다시 켰을 때 옛 이상의 복구가 뒤늦게 나가지도 않게(PR 9-1 major · #704). 정지는 사람이 한 일이라 게시하지 않는다
  for (const app of prev.filter((a) => !active.includes(a))) {
    // 수집기 자신의 그 앱 기록(app = ops · src = deploy-stale:adv · alive-read:adv · log-read:adv-bot-error)도 같다(PR #705 Codex P2)
    const own = new RegExp(`:${app}(-|$)`)
    for (const e of Object.values(ctx.state.fps)) {
      const mine = e.app === app || (e.app === 'ops' && e.role === 'collector' && own.test(e.src || ''))
      if (mine && e.kind === 'state' && (e.open || e.deferred)) Object.assign(e, { open: false, deferred: false, ok: 0, pending: 0 })
    }
  }
  ctx.state.active = active
  return active
}

async function collect(ctx, pm2Bin) {
  ctx.active = activeApps(ctx)
  const late = ctx.state.lastRunAt !== null && ctx.now - ctx.state.lastRunAt > CONFIG.lateRuns * CONFIG.periodMin * MIN
  if (late) ctx.obs.push(collector('late', 'event'))
  ctx.deploy = deployWindow(ctx)
  await collectPm2(ctx, pm2Bin)
  await collectHealth(ctx)
  collectLogs(ctx)
  collectAlive(ctx)
  collectHermes(ctx)
  collectDisk(ctx)
}

async function run(pm2Bin, live) {
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
    const r = await deliver(posts, ctx, live)
    const obsLines = merge(ctx.obs).map((o) => JSON.stringify({ at: ctx.now, type: 'obs', fp: o.fp, app: o.app, role: o.role, src: o.src, sev: o.sev, count: o.count }))
    appendLines('events.jsonl', [...obsLines, ...r.events])
    if (summaryRun && state.summaryDate === kstDate(nowDate)) pruneEvents(ctx.now)
    state.lastRunAt = ctx.now
    writeAtomic(STATE(), prune(state, ctx.now))
    const tail = live ? ` · 차단 ${r.blocked}${r.why ? ` · ${r.why}` : ''} (게시)` : ' (dry-run)'
    console.log(`${kstMinute(nowDate)} 수집 통과 · 관측 ${obsLines.length} · 기록 ${r.posted} · 미룸 ${r.deferred} · 요약만 ${r.quiet}${tail}`)
    return 0
  } finally {
    releaseLock(lock, got.id)
  }
}

function parseArgs(argv) {
  let dry = false
  let testAlert = false
  let pm2Bin = path.join(path.dirname(path.dirname(process.execPath)), 'lib', 'node_modules', 'pm2', 'bin', 'pm2') // npm 전역 기본 위치(V16)
  for (const a of argv) {
    if (a === '--dry-run') dry = true
    else if (a === '--test-alert') testAlert = true
    else if (a.startsWith('--pm2-bin=')) pm2Bin = a.slice('--pm2-bin='.length)
    else return null
  }
  if (dry && testAlert) return null // 시험 게시는 게시 경로를 시험한다 — dry-run 과 함께 쓰지 않는다
  return { dry, testAlert, pm2Bin }
}

const USAGE = '사용법: node collect.cjs [--dry-run] [--pm2-bin=<절대 경로>]   |   node collect.cjs --test-alert'

// 시험 전용(PLEIADES_TEST=1) — 공통 시험 벡터를 게시 전 검사 ②·③ 에 통과시켜 사유 코드를 낸다(tools/ops/token_vectors.json)
function selfCheck() {
  const texts = JSON.parse(fs.readFileSync(0, 'utf8'))
  const secrets = JSON.parse(process.env.OPS_SELFCHECK_SECRETS || '[]')
  console.log(JSON.stringify(texts.map((t) => checkPost(t, secrets))))
  return 0
}

async function main() {
  if (TEST && process.env.OPS_SELFCHECK === '1') return selfCheck()
  const args = parseArgs(process.argv.slice(2))
  if (!args) {
    console.error(USAGE)
    return 2
  }
  if (process.platform === 'darwin' && !TEST) {
    console.error('collect.cjs: 중단 — 서버 전용이다(I-3)')
    return 1
  }
  process.umask(0o077)
  if (args.testAlert) return testAlert()
  return run(args.pm2Bin, !args.dry)
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.log(`결과: 실패 — 예외 ${errCode(err)}`) // 메시지에 경로가 실릴 수 있어 코드만
    process.exit(1)
  },
)
