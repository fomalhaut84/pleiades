// judge.cjs — 011 실험 X1 의 순수 판정 함수(#632 · #634). x1.cjs 가 require 한다 — 같은 디렉터리에 같은 커밋으로 설치한다.
// 파일·프로세스·네트워크를 건드리지 않는다. 입력은 소스 문자열 · CLI stream-json 문자열 · 허용 목록뿐이다.
'use strict'

class Stop extends Error {} // 사전 판정 실패 — 질문 0 으로 멈춘다
const stop = (line) => { throw new Stop(line) }
const NAME_OK = /^[A-Za-z0-9_]{1,80}$/
const safeName = (s) => (typeof s === 'string' && NAME_OK.test(s) ? s : '?')

// ── S-5 분류 상수 파싱(Q118) ─────────────────────────────────────────
// `export const NAME…= <head>[ <body> ]` — 대괄호 짝을 문자열을 건너뛰며 센다. head = '=' 와 첫 '[' 사이(fin WRITE_TOOLS 는 'mcp(')
function block(src, name) {
  const i = src.indexOf(`export const ${name}`)
  if (i < 0) return null
  const eq = src.indexOf('=', i), open = src.indexOf('[', eq)
  if (eq < 0 || open < 0) return null
  let depth = 0
  for (let k = open; k < src.length; k++) {
    const ch = src[k]
    if (ch === "'" || ch === '"') {
      if ((k = src.indexOf(ch, k + 1)) < 0) return null
    } else if (ch === '`' || (ch === '/' && (src[k + 1] === '/' || src[k + 1] === '*'))) {
      stop('S-5: 분류 상수에 주석·템플릿 문자열 — 스크립트 갱신 필요') // 회귀: #632 9-1 major 1 — 주석 처리된 도구가 허용 목록으로 새지 않게
    } else if (ch === '[') depth++
    else if (ch === ']' && --depth === 0) return { head: src.slice(eq + 1, open).trim(), body: src.slice(open + 1, k) }
  }
  return null
}
const quoted = (s) => [...s.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map((m) => m[1] ?? m[2])

function finLists(src) {
  const prefix = (src.match(/const MCP_PREFIX = ['"]([^'"]+)['"]/) || [])[1]
  const read = block(src, 'READ_TOOLS'), write = block(src, 'WRITE_TOOLS')
  if (!prefix || !read || !write) stop('S-5: fin 분류 상수를 찾지 못했다(소스 형식 변경 — 스크립트 갱신 필요)')
  const seg = [...read.body.matchAll(/\.\.\.mcp\(\[([\s\S]*?)\]\)/g)]
  if (read.head !== '' || seg.length !== 1 || write.head !== 'mcp(') stop('S-5: fin 분류 상수 형식이 예상과 다르다(mcp([...]) 하나씩)')
  const outer = quoted(read.body.replace(seg[0][0], '')) // MCP 아닌 항목(WebSearch · WebFetch — §5-8 I-3) → 버린다
  return { prefix, read: quoted(seg[0][1]).map((n) => prefix + n), write: quoted(write.body).map((n) => prefix + n), dropped: outer.length }
}

function fitLists(src) {
  const allow = block(src, 'ADVISOR_ALLOWED_TOOLS'), excl = block(src, 'ADVISOR_EXCLUDED_TOOLS')
  if (!allow || !excl || allow.head || excl.head) stop('S-5: fit 분류 상수를 찾지 못했다(소스 형식 변경 — 스크립트 갱신 필요)')
  return { read: quoted(allow.body), write: quoted(excl.body), dropped: 0 }
}

// ── stream-json ──────────────────────────────────────────────────────
function parseStream(text) {
  const calls = [], byId = new Map()
  let result = null
  for (const line of text.split('\n')) {
    let e
    try { e = JSON.parse(line) } catch { continue }
    const content = e && e.message && Array.isArray(e.message.content) ? e.message.content : []
    if (e.type === 'assistant') {
      for (const b of content) if (b && b.type === 'tool_use' && typeof b.name === 'string') {
        const c = { name: b.name, ok: false }
        calls.push(c)
        if (typeof b.id === 'string') byId.set(b.id, c)
      }
    } else if (e.type === 'user') {
      for (const b of content) if (b && b.type === 'tool_result' && byId.has(b.tool_use_id)) byId.get(b.tool_use_id).ok = b.is_error !== true
    } else if (e.type === 'result') result = e
  }
  return { calls, result }
}

// ── #634 세션 init 판정(fail-closed) ─────────────────────────────────
// CLI stream-json 첫 이벤트 {type:'system', subtype:'init', tools:[이름], mcp_servers:[{name, status}], plugins:[…], plugin_errors?, mcp_server_errors?}
// (필드는 로컬 CLI 2.1.322 의 init 생성 코드에서 확인 · 서버 2.1.308 은 런북 8절). 판정은 둘로 나눈다(회귀: #634 9-1 major 1):
//  - violation(위반 → J2 실패): 플러그인 ≥1 · 서버 수·이름 불일치 · 목록 밖 도구 · init 앞의 hook 이벤트
//  - format(형식 → 자식을 끊되 J2 판정 불가 · 실행 횟수에 넣지 않음): init 없음 · 필드 없음·형식 다름 · 서버가 아직/못 연결(알 수 없는 상태 포함)
// init 앞 system/hook_* 를 위반으로 보는 근거: 어느 범위에도 hooks 가 없으면(S-3) hook 이벤트는 나지 않는다 — 났다면 차단하려던
// 설정(플러그인·user hooks)이 실제로 로드됐다는 직접 증거다. 그 밖의 init 앞 이벤트는 CLI 형식 변화로 보고 형식 문제로 둔다.
const KNOWN_STATUS = new Set(['connected', 'pending', 'failed', 'needs-auth', 'disabled'])
// #645: 서버 CLI 2.1.311 init 에 실린 내장 플러그인 출처(2026-11-12 서버 실측). 바꾸면 런북 4-a 의 목록도 같이.
const BUILTIN_PLUGINS = new Set(['cc-plugin-agents-md@builtin', 'cc-plugin-telemetry@builtin', 'cc-plugin-plugin-authoring@builtin'])
const fmt = (why, extra = {}) => ({ ok: false, kind: 'format', why, ...extra })
function judgeInit(e, allow, serverKeys) {
  if (e && e.type === 'system' && typeof e.subtype === 'string' && e.subtype.startsWith('hook_')) return { ok: false, kind: 'violation', why: 'init 전 hook' }
  if (!e || e.type !== 'system' || e.subtype !== 'init') return fmt('init 없음')
  if (!Array.isArray(e.tools) || !Array.isArray(e.mcp_servers) || !Array.isArray(e.plugins)) return fmt('init 필드 없음')
  if (['plugin_errors', 'mcp_server_errors'].some((k) => e[k] !== undefined && !Array.isArray(e[k]))) return fmt('init 필드 형식')
  // #645: CLI 내장 플러그인은 설정 범위와 무관하게 늘 로드된다(서버 CLI 2.1.311 실측 3 — 같은 CLI·같은 플래그인 운영 advisor 도 같을 것이다 · 추정).
  // 위반에서 빼고 개수만 보고한다. **실측한 출처 문자열과 정확히 같을 때만** 내장으로 본다(9-1 major — 접미사 `@builtin` 만 보면 사용자가
  // 이름을 `builtin` 으로 붙인 마켓플레이스의 플러그인도 빠진다). CLI 업데이트로 새 내장이 생기면 위반으로 멈춘다 → 런북대로 목록을 갱신한다.
  const isBuiltin = (p) => !!p && typeof p === 'object' && typeof p.source === 'string' && BUILTIN_PLUGINS.has(p.source)
  const builtin = e.plugins.filter(isBuiltin).length
  const plugins = e.plugins.length - builtin + (e.plugin_errors || []).length
  const names = e.mcp_servers.map((m) => m && m.name)
  const servers = e.mcp_servers.length
  const connected = serverKeys.filter((k) => e.mcp_servers.some((m) => m && m.name === k && m.status === 'connected')).length
  const outside = e.tools.filter((t) => !allow.has(t)).length // 내장 도구(--tools "" 기대)도 여기서 걸린다
  const extraServer = servers !== serverKeys.length || !serverKeys.every((k) => names.includes(k)) || (e.mcp_server_errors || []).length > 0
  const counts = { plugins, builtin, servers, connected, outside }
  const why = plugins ? '플러그인' : extraServer ? 'MCP 서버' : outside ? '목록 밖 도구' : ''
  if (why) return { ok: false, kind: 'violation', why, ...counts }
  if (connected !== serverKeys.length) {
    const unknown = e.mcp_servers.some((m) => !m || !KNOWN_STATUS.has(m.status))
    return fmt(unknown ? '알 수 없는 MCP 상태' : 'MCP 미연결', counts)
  }
  return { ok: true, kind: '', why: '', ...counts }
}

function judgeAnswer(r, lists, pin) {
  const { calls, result } = parseStream(r.out)
  const allow = new Set(lists.allow)
  const dom = (pre) => ({ n: calls.filter((c) => c.name.startsWith(pre)).length, ok: calls.filter((c) => c.name.startsWith(pre) && c.ok).length })
  const outside = calls.filter((c) => !allow.has(c.name))
  let status = '완료', code = ''
  if (!r.init || !r.init.ok) [status, code] = r.init && r.init.kind === 'violation' ? ['실패', 'init'] : ['오류', 'init 형식'] // #634 — 끊은 질문
  else if (r.timedOut) [status, code] = ['오류', 'timeout']
  else if (!result) [status, code] = ['오류', 'no-result']
  else if (result.subtype === 'error_max_budget_usd') status = '판정 불가'
  else if (result.is_error === true || result.subtype !== 'success') [status, code] = ['오류', safeName(String(result.subtype))]
  const used = result && result.modelUsage && typeof result.modelUsage === 'object' ? Object.keys(result.modelUsage) : []
  return { status, code, replied: !!r.replied || calls.length > 0, init: r.init || { ok: false, kind: 'format', why: 'init 없음' }, cost: result && typeof result.total_cost_usd === 'number' ? result.total_cost_usd : null,
    turns: result && typeof result.num_turns === 'number' ? result.num_turns : null, ms: r.ms,
    fin: dom(lists.pre.fin), fit: dom(lists.pre.fit), outside: outside.length, outsideNames: outside.map((c) => safeName(c.name)).slice(0, 5),
    drift: used.length === 0 ? '판정 불가' : used.every((m) => m === pin.sonnet || m === pin.haiku) && used.includes(pin.sonnet) ? '없음' : '있음',
    text: result && typeof result.result === 'string' ? result.result : '', calls }
}

module.exports = { Stop, stop, safeName, finLists, fitLists, parseStream, judgeInit, judgeAnswer }
