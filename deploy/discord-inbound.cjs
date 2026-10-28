#!/usr/bin/env node
// discord-inbound.cjs — discord-inbound.sh 의 노드 쪽 (009 D-2 PR-3 · #367). 플랫폼 설정 파일의 대화 채널 키 한 줄만 읽고·고친다.
//
// 사용:  INBOUND_VALUE=<채널ID|빈 값> node deploy/discord-inbound.cjs set <파일> <KEY>   그 키 줄만 바꾼다(없으면 끝에 더한다 · 나머지 줄·주석·권한 그대로)
//        node deploy/discord-inbound.cjs state <파일> <KEY>                               "설정됨" / "비어 있음"
// 값은 인자가 아니라 env 로 받는다(프로세스 목록에 남지 않게). 출력: 판정 양식 줄("F <줄>")과 마지막 "RESULT ok|fail" — 값은 내지 않는다.
// 해석은 discord-switch.cjs 와 같은 규칙(따옴표 값 · 따옴표 없는 값은 " #" 앞까지). 의존성 없음.
'use strict'

const fs = require('fs')
const path = require('path')

const KEYS = new Set(['DISCORD_CHANNEL_ID_FITNESS_CHAT'])
const SNOWFLAKE_RE = /^\d{17,20}$/
const LINE_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/

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

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    out('플랫폼 설정을 읽지 못했다')
    return finish(false)
  }
}

/** 키의 마지막 유효 줄 값(앱 platformEnv 와 같이 뒤 줄이 이긴다) — 없으면 '' */
function valueOf(text, key) {
  let v = ''
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue
    const m = LINE_RE.exec(line)
    if (m === null || m[1] !== key) continue
    const parsed = parseValue(m[2])
    v = parsed === undefined ? '' : parsed
  }
  return v
}

function state(file, key) {
  out(`플랫폼 파일 키 ${valueOf(readText(file), key).trim() === '' ? '비어 있음' : '설정됨'}`)
  return finish(true)
}

// 키 줄만 바꾼다 — 같은 디렉터리 임시 파일(600)에 쓰고 rename(중간 상태를 앱이 읽지 않게 · mtime 이 바뀌어 다음 호출부터 반영)
function set(file, key) {
  const value = (process.env.INBOUND_VALUE || '').trim()
  if (value !== '' && !SNOWFLAKE_RE.test(value)) {
    out('채널 ID 형식이 아니다(숫자 17~20자리)')
    return finish(false)
  }
  const text = readText(file)
  let seen = 0
  const lines = text.split('\n').map((line) => {
    const m = LINE_RE.exec(line)
    if (/^\s*#/.test(line) || m === null || m[1] !== key) return line
    seen += 1
    return `${key}="${value}"`
  })
  if (seen === 0) {
    if (lines.length && lines[lines.length - 1] === '') lines.pop()
    lines.push(`${key}="${value}"`, '')
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
  const after = valueOf(readText(file), key)
  out(`키 줄 ${seen === 0 ? '추가' : `교체 ${seen}`} · 플랫폼 파일 키 ${after === '' ? '비어 있음' : '설정됨'}`)
  return finish(after === value)
}

function main() {
  const [cmd, file, key] = process.argv.slice(2)
  if (!file || !KEYS.has(key)) {
    out('사용법: <set|state> <파일> <KEY>')
    return finish(false)
  }
  if (cmd === 'set') return set(file, key)
  if (cmd === 'state') return state(file, key)
  out('사용법: <set|state> <파일> <KEY>')
  return finish(false)
}

try {
  main()
} catch {
  out('예외')
  finish(false)
}
