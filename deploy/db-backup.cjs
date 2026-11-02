#!/usr/bin/env node
// db-backup.cjs — fin·fit DB 를 서버 안 백업 위치에 매일 뜬다 (#441). 서버 밖 보관은 다음 단계다.
//
// 사용:  node db-backup.cjs                백업 1회(crontab 이 부른다)
//        node db-backup.cjs --test-alert   실패 알림 경로만 시험한다
//
// 서비스 계정으로 돈다 — 접속 정보는 각 앱 체크아웃의 .env DATABASE_URL · 비밀번호는 명령줄에 두지 않는다(ps 노출).
// 체크아웃 안에 두지 않는다 — R-8 로 옛 태그를 꺼내면 파일이 사라져 백업이 조용히 멈춘다. 설치는 docs/runbooks/db-backup.md.
// 검증(크기 · pg_restore -l)을 통과한 덤프만 정식 이름으로 옮기고, 그 앱이 성공했을 때만 오래된 것을 지운다.
// 실패 = 종료 코드 1 + Discord 알림(앱 이름·사유 코드만). 일요일 성공도 한 번 알린다 — 그 알림이 끊기면 크론이 멈춘 것이다.
// 크기가 직전의 절반 아래로 줄면 경고하고 옛 덤프를 지우지 않는다 — 비어 버린 DB 가 좋은 백업을 밀어내지 않게.
// 덤프 전체를 읽어 검증하지만 실제 복원을 증명하지는 않는다 — 복원 시험은 런북.
'use strict'

process.env.TZ = 'Asia/Seoul' // 파일 이름과 주간 요일은 서버 시간대와 무관하게 KST 다(crontab 시각은 런북에서 확인한다)

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const TEST = process.env.PLEIADES_TEST === '1'
const HOME = os.homedir()
const ROOT = process.env.PLEIADES_BACKUP_ROOT || '/backup/pleiades-db'
const APPS = {
  fin: path.join(HOME, 'pleiades-fin', 'apps', 'finance'),
  fit: path.join(HOME, 'pleiades-fit', 'apps', 'fitness'),
}
const KEEP_DAILY = 14
const KEEP_WEEKLY = 8
const MIN_BYTES = 1024 // pg_dump 가 실패해도 빈 파일은 생긴다
const MIN_FREE_MB = TEST && process.env.BACKUP_MIN_FREE_MB ? Number(process.env.BACKUP_MIN_FREE_MB) : 1024
const STALE_LOCK_MS = 6 * 3600 * 1000
const DUMP_TIMEOUT_MS = 30 * 60 * 1000
const ALERT_TIMEOUT_MS = 10_000
const NOW = TEST && process.env.BACKUP_NOW ? new Date(process.env.BACKUP_NOW) : new Date()

const pad = (n) => String(n).padStart(2, '0')
const stamp = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
const mb = (bytes) => Math.round(bytes / 1048576)

function dotenvFor(appDir) {
  return require(require.resolve('dotenv', { paths: [appDir] }))
}

// DATABASE_URL → libpq env. deploy/deploy.sh check_migration_names 와 같은 규칙이다 — 상속된 PG* 는 지워 다른 클러스터를 읽지 않는다
function libpqEnv(appDir) {
  const env = dotenvFor(appDir).parse(fs.readFileSync(path.join(appDir, '.env')))
  const u = new URL(env.DATABASE_URL)
  const schema = u.searchParams.get('schema')
  if (schema && schema !== 'public') throw new Error('schema')
  if (u.searchParams.has('sslidentity')) throw new Error('sslidentity')
  const out = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PG')))
  const dec = decodeURIComponent
  if (u.hostname) out.PGHOST = u.hostname.replace(/^\[|\]$/g, '')
  out.PGPORT = u.port || '5432'
  if (u.username) out.PGUSER = dec(u.username)
  if (u.password) out.PGPASSWORD = dec(u.password)
  out.PGDATABASE = dec(u.pathname.replace(/^\//, ''))
  const LIBPQ = { sslmode: 'PGSSLMODE', host: 'PGHOST', port: 'PGPORT', connect_timeout: 'PGCONNECT_TIMEOUT' }
  for (const [k, val] of u.searchParams) if (LIBPQ[k]) out[LIBPQ[k]] = val
  if (u.searchParams.has('sslcert')) out.PGSSLROOTCERT = path.resolve(appDir, 'prisma', u.searchParams.get('sslcert'))
  if (!out.PGHOST || !out.PGDATABASE) throw new Error('url')
  return out
}

function prune(dir, app, keep) {
  const re = new RegExp(`^${app}-\\d{8}-\\d{4}\\.dump$`) // 다른 이름의 파일은 건드리지 않는다
  const names = fs.readdirSync(dir).filter((n) => re.test(n)).sort().reverse()
  for (const n of names.slice(keep)) fs.unlinkSync(path.join(dir, n))
}

function latestSize(dir, app) {
  const re = new RegExp(`^${app}-\\d{8}-\\d{4}\\.dump$`)
  const newest = fs.readdirSync(dir).filter((n) => re.test(n)).sort().pop()
  return newest ? fs.statSync(path.join(dir, newest)).size : 0
}

function syncFile(p) {
  const fd = fs.openSync(p, 'r')
  try {
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}

function backupApp(app, appDir) {
  const daily = path.join(ROOT, 'daily')
  const weekly = path.join(ROOT, 'weekly')
  const tmp = path.join(daily, `.tmp-${app}-${process.pid}`)
  const remove = () => fs.rmSync(tmp, { force: true })
  try {
    fs.mkdirSync(daily, { recursive: true })
    fs.mkdirSync(weekly, { recursive: true })
    for (const n of fs.readdirSync(daily)) {
      if (n.startsWith(`.tmp-${app}-`)) fs.rmSync(path.join(daily, n), { force: true }) // 잠금을 쥔 뒤라 지난 실행의 잔여물이다
    }

    let env
    try {
      env = libpqEnv(appDir)
    } catch {
      return { ok: false, reason: 'env' } // 메시지에 URL 이 실릴 수 있어 내지 않는다
    }

    // -w: 비밀번호를 묻지 않는다 — 터미널을 기다리며 잠금을 쥐지 않게
    const dump = spawnSync('pg_dump', ['-w', '-Fc', '-f', tmp], { env, encoding: 'utf8', timeout: DUMP_TIMEOUT_MS })
    if (dump.error || dump.status !== 0) {
      remove()
      if (dump.error) console.error(`[${app}] pg_dump: ${dump.error.code || 'error'}`)
      if (dump.stderr) console.error(`[${app}] pg_dump: ${dump.stderr.trim()}`)
      return { ok: false, reason: 'pg_dump' }
    }
    const bytes = fs.statSync(tmp).size
    if (bytes < MIN_BYTES) {
      remove()
      return { ok: false, reason: 'small' }
    }
    const list = spawnSync('pg_restore', ['-l', tmp], { encoding: 'utf8', maxBuffer: 64 * 1048576, timeout: DUMP_TIMEOUT_MS })
    const tables = list.status === 0 ? (list.stdout.match(/TABLE DATA/g) || []).length : 0
    // -l 은 목차만 읽는다 — 잘린 파일을 거르려고 전체를 읽어 버린다
    const full = tables < 1 ? null : spawnSync('pg_restore', ['-f', '/dev/null', tmp], { stdio: 'ignore', timeout: DUMP_TIMEOUT_MS })
    if (!full || full.error || full.status !== 0) {
      remove()
      return { ok: false, reason: 'verify' }
    }

    const shrunk = latestSize(daily, app) >= MIN_BYTES && bytes * 2 < latestSize(daily, app)
    syncFile(tmp)

    const name = `${app}-${stamp(NOW)}.dump`
    const final = path.join(daily, name)
    fs.renameSync(tmp, final)
    syncFile(daily)
    const today = name.slice(0, name.lastIndexOf('-'))
    if (NOW.getDay() === 0 && !fs.readdirSync(weekly).some((n) => n.startsWith(`${today}-`))) {
      fs.linkSync(final, path.join(weekly, name)) // 같은 디스크라 복사하지 않는다 — 매일분이 지워져도 남는다 · 날짜당 1개
    }
    if (!shrunk) {
      prune(daily, app, KEEP_DAILY)
      prune(weekly, app, KEEP_WEEKLY)
    }
    return { ok: true, tables, bytes, shrunk }
  } catch (err) {
    remove()
    console.error(`[${app}] ${err && err.code ? err.code : 'error'}`)
    return { ok: false, reason: 'write' }
  }
}

function webhook() {
  const file = process.env.PLEIADES_ENV_FILE || (TEST ? '' : path.join(HOME, 'pleiades-platform.env'))
  if (!file) return ''
  for (const dir of Object.values(APPS)) {
    try {
      const env = dotenvFor(dir).parse(fs.readFileSync(file))
      return env.NOTIFY_DEPLOY_CHANNEL === 'discord' ? env.DISCORD_WEBHOOK_DEPLOY || '' : ''
    } catch {
      // 다음 앱의 dotenv 로 다시 해 본다
    }
  }
  return ''
}

async function alert(text) {
  const url = webhook()
  if (!url) return '웹훅 없음'
  if (TEST && process.env.NOTIFY_DRY_RUN === '1') {
    console.log(`(dry-run) ${text}`)
    return null
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ALERT_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
      signal: ctrl.signal,
    })
    if (res.body && typeof res.body.cancel === 'function') await res.body.cancel().catch(() => {})
    return res.ok ? null : `HTTP ${res.status}`
  } catch (err) {
    return err && err.name ? err.name : 'error' // 오류 메시지에 웹훅 URL 이 실릴 수 있다
  } finally {
    clearTimeout(timer)
  }
}

function acquireLock(lock) {
  try {
    fs.mkdirSync(lock)
    return true
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
  }
  if (Date.now() - fs.statSync(lock).mtimeMs < STALE_LOCK_MS) return false
  fs.rmdirSync(lock)
  fs.mkdirSync(lock)
  return true
}

async function failAll(reason) {
  console.log(`${stamp(NOW)} 결과: 실패 — ${reason}`)
  const err = await alert(`⚠️ DB 백업 실패: 전체(${reason})`)
  if (err) console.log(`알림 실패: ${err}`)
  return 1
}

async function run() {
  if (!fs.existsSync(ROOT)) return failAll('백업 위치 없음 또는 접근 불가')
  const lock = path.join(ROOT, '.lock')
  let locked
  try {
    locked = acquireLock(lock)
  } catch {
    return failAll('백업 위치 쓰기 실패')
  }
  if (!locked) return failAll('이전 실행이 아직 돈다')

  const lines = []
  const failed = []
  const shrunk = []
  let fatal = ''
  try {
    const free = fs.statfsSync(ROOT)
    if ((free.bavail * free.bsize) / 1048576 < MIN_FREE_MB) fatal = '디스크 여유 부족'
  } catch {
    fatal = '디스크 확인 실패'
  }
  if (!fatal) {
    for (const [app, dir] of Object.entries(APPS)) {
      const r = backupApp(app, dir)
      if (r.ok) lines.push(`${app} 테이블 ${r.tables} · ${mb(r.bytes)} MB`)
      else failed.push(`${app}(${r.reason})`)
      if (r.shrunk) shrunk.push(app)
    }
  }
  try {
    fs.rmdirSync(lock)
  } catch {
    failed.push('잠금 해제')
  }
  if (fatal) return failAll(fatal)

  const when = stamp(NOW)
  lines.forEach((l) => console.log(`${when} 통과: ${l}`))
  if (shrunk.length > 0) {
    const err = await alert(`⚠️ DB 백업 크기 급감: ${shrunk.join(' · ')} — 옛 덤프를 지우지 않았다`)
    console.log(`${when} 경고: 크기 급감 ${shrunk.join(' · ')}`)
    if (err) console.log(`알림 실패: ${err}`)
  }
  if (failed.length > 0) {
    console.log(`${when} 결과: 실패 — ${failed.join(' · ')}`)
    const err = await alert(`⚠️ DB 백업 실패: ${failed.join(' · ')}`)
    if (err) console.log(`알림 실패: ${err}`)
    return 1
  }
  console.log(`${when} 결과: 통과`)
  if (NOW.getDay() === 0) {
    const err = await alert(`✅ 주간 DB 백업 정상: ${lines.join(' / ')}`)
    if (err) console.log(`알림 실패: ${err}`)
  }
  return 0
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length === 1 && args[0] !== '--test-alert')) {
    console.error('사용법: node db-backup.cjs [--test-alert]')
    return 2
  }
  if (process.platform === 'darwin' && !TEST) {
    console.error('db-backup.cjs: 중단 — 서버 전용이다(I-3)')
    return 1
  }
  process.umask(0o077)
  if (args[0] === '--test-alert') {
    const err = await alert('🔔 DB 백업 알림 시험')
    console.log(err ? `알림 실패: ${err}` : '알림 보냄')
    return err ? 1 : 0
  }
  return run()
}

main().then(
  (code) => process.exit(code),
  async () => {
    console.log('결과: 실패 — 예외')
    await alert('⚠️ DB 백업 실패: 전체(예외)').catch(() => {})
    process.exit(1)
  },
)
