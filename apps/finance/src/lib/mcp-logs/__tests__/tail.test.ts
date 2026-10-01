import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readNewBytes, splitLinesWithCarryover } from '../tail'

describe('splitLinesWithCarryover', () => {
  it('완결된 여러 라인 → 모두 방출, carry 는 빈 문자열', () => {
    const r = splitLinesWithCarryover('a\nb\nc\n', '')
    expect(r.lines).toEqual(['a', 'b', 'c'])
    expect(r.carry).toBe('')
  })

  it('마지막 라인이 `\\n` 으로 안 끝나면 carry 로 보존', () => {
    const r = splitLinesWithCarryover('a\nb\npartial', '')
    expect(r.lines).toEqual(['a', 'b'])
    expect(r.carry).toBe('partial')
  })

  it('이전 carry 와 결합해 완결된 라인 방출', () => {
    const first = splitLinesWithCarryover('{"level":"in', '')
    expect(first.lines).toEqual([])
    expect(first.carry).toBe('{"level":"in')
    const second = splitLinesWithCarryover('fo","msg":"ok"}\n', first.carry)
    expect(second.lines).toEqual(['{"level":"info","msg":"ok"}'])
    expect(second.carry).toBe('')
  })

  it('빈 라인 (`\\n\\n`) 은 skip', () => {
    const r = splitLinesWithCarryover('a\n\nb\n', '')
    expect(r.lines).toEqual(['a', 'b'])
    expect(r.carry).toBe('')
  })

  it('빈 chunk 는 lines 없음 + carry 유지', () => {
    const r = splitLinesWithCarryover('', 'leftover')
    expect(r.lines).toEqual([])
    expect(r.carry).toBe('leftover')
  })

  it('carry 만 있는 상태에서 다음 chunk 가 오면 이어붙임', () => {
    const r1 = splitLinesWithCarryover('half', '')
    const r2 = splitLinesWithCarryover('-line\nnext\n', r1.carry)
    expect(r2.lines).toEqual(['half-line', 'next'])
    expect(r2.carry).toBe('')
  })
})

describe('readNewBytes', () => {
  let tmpFile: string
  let fd: number

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `tail-test-${Date.now()}-${Math.random().toString(36).slice(2)}.log`)
    fs.writeFileSync(tmpFile, 'hello world\n')
    fd = fs.openSync(tmpFile, 'r')
  })

  afterEach(() => {
    try { fs.closeSync(fd) } catch { /* already closed */ }
    try { fs.unlinkSync(tmpFile) } catch { /* deleted */ }
  })

  it('offset 부터 지정 길이만큼 raw Buffer 반환 + bytesRead', () => {
    // "hello world\n" 12바이트 중 [6, 11) → "world"
    const r = readNewBytes(fd, 6, 11)
    expect(r.buf.toString('utf-8')).toBe('world')
    expect(r.bytesRead).toBe(5)
  })

  it('to <= from → 빈 결과 (bytesRead=0)', () => {
    const r1 = readNewBytes(fd, 5, 5)
    expect(r1.bytesRead).toBe(0)
    expect(r1.buf.length).toBe(0)
    const r2 = readNewBytes(fd, 5, 0)
    expect(r2.bytesRead).toBe(0)
    expect(r2.buf.length).toBe(0)
  })

  it('파일에 append 후 새 offset 부터 읽으면 신규 바이트만 반환', () => {
    const beforeSize = fs.statSync(tmpFile).size
    fs.appendFileSync(tmpFile, 'appended\n')
    const afterSize = fs.statSync(tmpFile).size
    const r = readNewBytes(fd, beforeSize, afterSize)
    expect(r.buf.toString('utf-8')).toBe('appended\n')
    expect(r.bytesRead).toBe(afterSize - beforeSize)
  })

  // Codex #454 P1 회귀 방지 — 요청 범위가 실제 파일 크기를 초과하면 short-read.
  // 이전에는 요청 size 만큼 무조건 전진해 유실됐다. 이제는 bytesRead 로 정확 소비량 노출.
  it('요청 범위가 파일보다 크면 실제 읽은 바이트만 반환 (short-read)', () => {
    const size = fs.statSync(tmpFile).size
    // "hello world\n" = 12 바이트. from=6, to=100 → 실제 파일 잔량 (12-6=6) 만 읽힘.
    const r = readNewBytes(fd, 6, 100)
    expect(r.buf.toString('utf-8')).toBe('world\n')
    expect(r.bytesRead).toBe(size - 6)
    expect(r.bytesRead).toBeLessThan(100 - 6) // 요청보다 작음
  })
})

// Codex #455 P2 회귀 방지 — readNewBytes 는 raw Buffer 를 반환하고 UTF-8 디코딩을
// 하지 않는다. caller (route) 는 StringDecoder 로 partial byte 를 버퍼링해야 한다.
describe('UTF-8 chunk 경계 안전성 (StringDecoder 계약 검증)', () => {
  it('한국어 3바이트 문자를 임의 지점에서 잘라 두 chunk 로 나눠도 decoder 로 재조립', async () => {
    const { StringDecoder } = await import('node:string_decoder')
    // "안녕하세요\n" — 각 한글은 UTF-8 3바이트. 총 16바이트 (5*3 + 1).
    const full = Buffer.from('안녕하세요\n', 'utf-8')
    expect(full.length).toBe(16)

    // 중간 지점 (예: 4바이트 = "안" 3바이트 + "녕" 첫 1바이트) 에서 절단.
    const partA = full.subarray(0, 4)
    const partB = full.subarray(4)

    // 각각 toString('utf-8') 하면 partA 는 "안" + U+FFFD 로 치환 → 손상.
    expect(partA.toString('utf-8')).not.toBe('안')

    // StringDecoder 는 partial byte 를 내부에 남기고 다음 write 와 합쳐 정상 복원.
    const dec = new StringDecoder('utf8')
    const out1 = dec.write(partA)
    const out2 = dec.write(partB)
    expect(out1 + out2).toBe('안녕하세요\n')
  })

  it('splitLinesWithCarryover 는 decoder 출력에 대해서만 안전 — decoder 없이 쪼갠 UTF-8 은 손상', async () => {
    const { StringDecoder } = await import('node:string_decoder')
    const full = Buffer.from('한글줄1\n한글줄2\n', 'utf-8')
    const cut = 5 // "한" (3) + "글" 첫 2 바이트에서 절단 → 두번째 chunk 에 나머지
    const a = full.subarray(0, cut)
    const b = full.subarray(cut)

    const dec = new StringDecoder('utf8')
    const chunkA = dec.write(a)
    const s1 = splitLinesWithCarryover(chunkA, '')
    expect(s1.lines).toEqual([])  // 아직 \n 없음

    const chunkB = dec.write(b)
    const s2 = splitLinesWithCarryover(chunkB, s1.carry)
    expect(s2.lines).toEqual(['한글줄1', '한글줄2'])
    expect(s2.carry).toBe('')
  })
})
