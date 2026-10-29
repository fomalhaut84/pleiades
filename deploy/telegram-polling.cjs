#!/usr/bin/env node
// telegram-polling.cjs — telegram-polling.sh 의 노드 쪽 (009 D-2′ · #376). 앱 .env 의 TELEGRAM_POLLING 한 줄만 읽고·고친다.
//
// 사용:  POLLING_VALUE=<off|빈 값> node deploy/telegram-polling.cjs set <앱 .env>   그 키 줄만 바꾼다(없으면 끝에 더한다 · 나머지 줄·주석·권한 그대로)
//        node deploy/telegram-polling.cjs state <앱 .env>                          "끔(off)" / "켬(off 아님)"
//        node deploy/telegram-polling.cjs record <상태 파일>                       봇이 남긴 폴링 상태(logs/telegram-polling-<app>.json) "off" / "on" / "없음"
// 출력: 판정 양식 줄("F <줄>")과 마지막 "RESULT ok|fail" — 다른 키의 값은 내지 않는다.
// 해석은 discord-inbound.cjs 와 같은 규칙(같은 키가 여러 줄이면 뒤 줄이 이긴다 — 앱 dotenv 17 parse 와 같다). 의존성 없음.
// .env 가 심링크면 대상 파일을 바꾼다(링크를 파일로 덮지 않는다).
'use strict'

const fs = require('fs')
const path = require('path')

const KEY = 'TELEGRAM_POLLING'
const VALUES = new Set(['off', ''])
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
    out('앱 .env 를 읽지 못했다')
    return finish(false)
  }
}

/** 키의 마지막 유효 줄 값 — 없으면 '' (set 은 모든 줄을 같은 값으로 바꾸므로 어느 쪽이 이겨도 같다) */
function valueOf(text) {
  let v = ''
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue
    const m = LINE_RE.exec(line)
    if (m === null || m[1] !== KEY) continue
    const parsed = parseValue(m[2])
    v = parsed === undefined ? '' : parsed
  }
  return v
}

const disabled = (v) => v.trim().toLowerCase() === 'off' // 앱 pollingDisabled 와 같다

function state(file) {
  out(`앱 .env 폴링 키 ${disabled(valueOf(readText(file))) ? '끔(off)' : '켬(off 아님)'}`)
  return finish(true)
}

// 키 줄만 바꾼다 — 대상 파일과 같은 디렉터리 임시 파일(600)에 쓰고 rename(재시작 전이라 앱이 중간 상태를 읽을 일은 없다)
function set(file) {
  const value = (process.env.POLLING_VALUE || '').trim()
  if (!VALUES.has(value)) {
    out('값은 off 또는 빈 값만')
    return finish(false)
  }
  let real
  try {
    real = fs.realpathSync(file)
  } catch {
    out('앱 .env 를 찾지 못했다')
    return finish(false)
  }
  const text = readText(real)
  let seen = 0
  const lines = text.split('\n').map((line) => {
    const m = LINE_RE.exec(line)
    if (/^\s*#/.test(line) || m === null || m[1] !== KEY) return line
    seen += 1
    return `${KEY}=${value}`
  })
  if (seen === 0) {
    if (lines.length && lines[lines.length - 1] === '') lines.pop()
    lines.push(`${KEY}=${value}`, '')
  }
  const tmp = path.join(path.dirname(real), `.${path.basename(real)}.${process.pid}.tmp`)
  try {
    fs.writeFileSync(tmp, lines.join('\n'), { mode: 0o600 })
    fs.chmodSync(tmp, 0o600)
    fs.renameSync(tmp, real)
  } catch {
    try {
      fs.unlinkSync(tmp)
    } catch {}
    out('앱 .env 를 쓰지 못했다')
    return finish(false)
  }
  const after = valueOf(readText(file))
  out(`키 줄 ${seen === 0 ? '추가' : `교체 ${seen}`} · 앱 .env 폴링 키 ${disabled(after) ? '끔(off)' : '켬(off 아님)'}`)
  return finish(disabled(after) === (value === 'off'))
}

function record(file) {
  let v
  try {
    v = JSON.parse(fs.readFileSync(file, 'utf8')).polling
  } catch {
    v = undefined
  }
  out(`봇 폴링 상태 기록 ${v === 'on' || v === 'off' ? v : '없음'}`)
  return finish(true)
}

function main() {
  const [cmd, file] = process.argv.slice(2)
  if (!file) {
    out('사용법: <set|state|record> <파일>')
    return finish(false)
  }
  if (cmd === 'set') return set(file)
  if (cmd === 'state') return state(file)
  if (cmd === 'record') return record(file)
  out('사용법: <set|state|record> <파일>')
  return finish(false)
}

try {
  main()
} catch {
  out('예외')
  finish(false)
}
