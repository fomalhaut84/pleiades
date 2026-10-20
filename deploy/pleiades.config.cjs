// pleiades pm2 정의 — 007 §4-1 · T-1b(#176). 서비스 apps/*/ecosystem.config.js 의 후신(I-19 로 그쪽은 실행 금지).
//
// 이름: pleiades-<fin|fit>-<web|bot|mcp> (007 Q77 · 서비스 myfinance*·myfitness* 와 분리 · tools/local/precheck.py 가 강제)
// 앱 선택: pm2 를 띄운 cwd 가 apps/<dir> 인 앱 하나만 정의한다 — run.sh 의 check_env 는 cwd 앱만 검사하므로
//          다른 앱 정의가 섞이면 검사 밖 env 로 뜬다(#171). deploy/deploy.sh 도 apps/<dir> 에서 pm2 를 부른다.
// 포트: PORT · MCP_PORT 를 셸 env > apps/<dir>/.env 순으로 읽고(dotenv 와 같은 우선순위 · check_env.effective_env),
//       없거나 잘못되면 로드를 거부한다 — 기본값을 두면 로컬에서 서비스 포트를 잡을 수 있다(I-12).
// 나머지 옵션은 서비스 정의 그대로다(kill_timeout · 지수 백오프 등 — 이유는 서비스 파일 주석).
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DIRS = { fin: 'finance', fit: 'fitness' }
const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/ // tools/local/check_env.py LINE 과 같다

function fail(msg) {
  throw new Error(`deploy/pleiades.config.cjs: ${msg}`)
}

function cwdApp() {
  const rel = path.relative(path.join(ROOT, 'apps'), fs.realpathSync(process.cwd()))
  const app = Object.keys(DIRS).find((k) => DIRS[k] === rel)
  if (!app) fail(`pm2 는 apps/finance 또는 apps/fitness 에서 띄운다 (cwd ${process.cwd()})`)
  return app
}

function parseDotenv(file) {
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = raw.match(LINE)
    if (!m || raw.trimStart().startsWith('#')) continue
    let value = m[2]
    if (value.length >= 2 && value[0] === value[value.length - 1] && `'"`.includes(value[0])) {
      value = value.slice(1, -1)
    }
    out[m[1]] = value
  }
  return out
}

function effectiveEnv(dir) {
  return { ...parseDotenv(path.join(dir, '.env')), ...process.env }
}

function ports(dir, env) {
  const out = {}
  for (const key of ['PORT', 'MCP_PORT']) {
    const value = env[key] ?? ''
    if (!/^[1-9][0-9]{0,4}$/.test(value) || Number(value) > 65535) {
      fail(`${key} 가 비었거나 포트가 아니다 (${JSON.stringify(value)}) — 셸 또는 ${path.relative(ROOT, dir)}/.env 에 둔다`)
    }
    out[key] = value
  }
  if (out.PORT === out.MCP_PORT) fail('PORT 와 MCP_PORT 가 같다')
  return out
}

const COMMON = { instances: 1, autorestart: true, log_date_format: 'YYYY-MM-DD HH:mm:ss' }
const WEB = { ...COMMON, script: 'node_modules/.bin/next', max_memory_restart: '1024M', node_args: '--max-old-space-size=1024' }
const LONG_RUNNING = {
  ...COMMON,
  kill_timeout: 15000,
  min_uptime: 30000,
  exp_backoff_restart_delay: 100,
  max_memory_restart: '512M',
  node_args: '--max-old-space-size=512',
}

function finApps(cwd, { PORT, MCP_PORT }) {
  return [
    { ...WEB, name: 'pleiades-fin-web', cwd, args: `start -p ${PORT}`, env: { NODE_ENV: 'production', PORT } },
    { ...LONG_RUNNING, name: 'pleiades-fin-bot', cwd, script: 'dist/bot/standalone.cjs', env: { NODE_ENV: 'production' } },
    {
      ...LONG_RUNNING,
      name: 'pleiades-fin-mcp',
      cwd,
      script: 'dist/mcp/server.cjs',
      env: { NODE_ENV: 'production', MCP_TRANSPORT: 'http', MCP_PORT, MCP_LOG_TEE_FILE: '1' },
    },
  ]
}

function fitApps(cwd, { PORT, MCP_PORT }, env) {
  const base = { NODE_ENV: 'production', TZ: 'Asia/Seoul' }
  // MCP 는 Garmin 조회를 웹 API 로 위임한다 — 코드 기본값은 4200 고정(mcp/tools/web-api.ts)이라 PORT 에서 만든다 (PR #179 Codex P2)
  const APP_BASE_URL = env.APP_BASE_URL || `http://localhost:${PORT}`
  return [
    { ...WEB, name: 'pleiades-fit-web', cwd, args: `start -p ${PORT}`, env: { ...base, PORT } },
    {
      ...LONG_RUNNING,
      name: 'pleiades-fit-bot',
      cwd,
      script: 'dist/bot/standalone.cjs',
      max_restarts: Number.MAX_SAFE_INTEGER,
      env: { ...base, MCP_PORT, ...(process.env.MCP_HTTP_URL ? { MCP_HTTP_URL: process.env.MCP_HTTP_URL } : {}) },
    },
    {
      ...LONG_RUNNING,
      name: 'pleiades-fit-mcp',
      cwd,
      script: 'dist/mcp/server.cjs',
      env: { ...base, MCP_TRANSPORT: 'http', MCP_PORT, MCP_LOG_TEE_FILE: '1', APP_BASE_URL },
    },
  ]
}

const app = cwdApp()
const cwd = path.join(ROOT, 'apps', DIRS[app])
const env = effectiveEnv(cwd)
module.exports = { apps: (app === 'fin' ? finApps : fitApps)(cwd, ports(cwd, env), env) }
