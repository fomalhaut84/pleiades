import { describe, expect, it } from 'vitest'
import { parseLines, applyFilter, tailN, computeStats } from '../parser'

const SAMPLE = [
  JSON.stringify({ level: 'info', time: '2026-07-08T01:00:00Z', pid: 1, service: 'mcp', msg: 'tool_call', tool: 'get_portfolio', args: { x: 1 }, latency_ms: 42, traceId: 'abcd1234', status: 'ok' }),
  JSON.stringify({ level: 'info', time: '2026-07-08T01:00:01Z', pid: 1, service: 'mcp', msg: 'tool_call', tool: 'get_portfolio', latency_ms: 60, traceId: 'ffff0000', status: 'ok' }),
  JSON.stringify({ level: 'warn', time: '2026-07-08T01:00:02Z', pid: 1, service: 'mcp', msg: 'tool_call_reported_error', tool: 'get_trades', status: 'error', err: { kind: 'reported', message: '보유수량 부족' }, traceId: 'aaaa0001' }),
  JSON.stringify({ level: 'error', time: '2026-07-08T01:00:03Z', pid: 1, service: 'mcp', msg: 'http_request_error', err: { message: 'oops' } }),
  JSON.stringify({ level: 'fatal', time: '2026-07-08T01:00:04Z', pid: 1, service: 'mcp', msg: 'http_server_error', err: { message: 'bind EADDRINUSE' } }),
].join('\n')

describe('parseLines', () => {
  it('빈 라인 skip, 각 라인을 LogEntry 로 변환', () => {
    const entries = parseLines(SAMPLE + '\n\n')
    expect(entries).toHaveLength(5)
    expect(entries[0].msg).toBe('tool_call')
    expect(entries[0].tool).toBe('get_portfolio')
    expect(entries[0].lineNo).toBe(1)
  })

  it('numeric level → 문자열 매핑', () => {
    const entries = parseLines('{"level":30,"msg":"tool_call"}')
    expect(entries[0].level).toBe('info')
  })

  it('파싱 실패는 raw + parseError=true', () => {
    const entries = parseLines('not a json\n{"level":"info","msg":"ok"}')
    expect(entries[0].parseError).toBe(true)
    expect(entries[0].raw).toBe('not a json')
    expect(entries[1].parseError).toBeUndefined()
  })
})

describe('applyFilter', () => {
  const entries = parseLines(SAMPLE)

  it('필터 없음 → 전체 반환', () => {
    expect(applyFilter(entries, {})).toHaveLength(5)
  })

  it('level=fatal → fatal 라인만', () => {
    const r = applyFilter(entries, { level: 'fatal' })
    expect(r).toHaveLength(1)
    expect(r[0].msg).toBe('http_server_error')
  })

  it('msg=tool_call → 2건', () => {
    expect(applyFilter(entries, { msg: 'tool_call' })).toHaveLength(2)
  })

  it('tool contains 대소문자 무관 부분 매치', () => {
    expect(applyFilter(entries, { tool: 'PORT' })).toHaveLength(2)
    expect(applyFilter(entries, { tool: 'trades' })).toHaveLength(1)
  })

  it('traceId 정확 매치', () => {
    expect(applyFilter(entries, { traceId: 'abcd1234' })).toHaveLength(1)
    expect(applyFilter(entries, { traceId: 'ffff0000' })).toHaveLength(1)
    expect(applyFilter(entries, { traceId: 'nope' })).toHaveLength(0)
  })

  it('복합 필터 (AND)', () => {
    expect(applyFilter(entries, { level: 'info', tool: 'get_portfolio' })).toHaveLength(2)
    expect(applyFilter(entries, { level: 'warn', tool: 'get_portfolio' })).toHaveLength(0)
  })
})

describe('tailN', () => {
  it('전체 라인이 maxLines 이하 → 원본 반환', () => {
    const r = tailN('a\nb\nc', 10)
    expect(r.text).toBe('a\nb\nc')
    expect(r.startLineNo).toBe(1)
  })

  it('초과 시 마지막 N 라인만, startLineNo 조정', () => {
    const r = tailN('a\nb\nc\nd\ne', 2)
    expect(r.text).toBe('d\ne')
    expect(r.startLineNo).toBe(4)
  })

  it('후행 newline 이 있어도 실제 라인 수 기준으로 tail (Codex #425 P3 회귀 방지)', () => {
    // pino 로그는 매 record 끝에 `\n` → split 결과 마지막 원소는 ''.
    // 이전 구현은 이 empty 원소를 슬라이스에 포함해 실제 반환 라인이 1개 부족했음.
    const r = tailN('a\nb\nc\n', 2)
    expect(r.text).toBe('b\nc')
    expect(r.startLineNo).toBe(2)
  })

  it('후행 newline + 정확히 maxLines → 원본 반환', () => {
    const r = tailN('a\nb\n', 2)
    expect(r.text).toBe('a\nb\n')
    expect(r.startLineNo).toBe(1)
  })

  it('maxLines=0 → 빈', () => {
    expect(tailN('a\nb', 0).text).toBe('')
  })
})

describe('computeStats', () => {
  const entries = parseLines(SAMPLE)
  const stats = computeStats(entries)

  it('total = 라인 수', () => {
    expect(stats.total).toBe(5)
  })

  it('byLevel 내림차순', () => {
    const counts = Object.fromEntries(stats.byLevel.map((b) => [b.level, b.count]))
    expect(counts.info).toBe(2)
    expect(counts.warn).toBe(1)
    expect(counts.error).toBe(1)
    expect(counts.fatal).toBe(1)
  })

  it('byMsg 는 msg 별 카운트', () => {
    const map = Object.fromEntries(stats.byMsg.map((b) => [b.msg, b.count]))
    expect(map.tool_call).toBe(2)
    expect(map.tool_call_reported_error).toBe(1)
  })

  it('byTool 에러 카운트 (status=error 또는 error/fatal/warn level)', () => {
    const portfolio = stats.byTool.find((b) => b.tool === 'get_portfolio')!
    expect(portfolio.count).toBe(2)
    expect(portfolio.errors).toBe(0)
    const trades = stats.byTool.find((b) => b.tool === 'get_trades')!
    expect(trades.count).toBe(1)
    expect(trades.errors).toBe(1) // reported_error (warn + status=error)
  })

  it('latencyByTool 은 tool_call + latency_ms 있는 항목만', () => {
    const portfolio = stats.latencyByTool.find((b) => b.tool === 'get_portfolio')!
    expect(portfolio.count).toBe(2)
    expect(portfolio.avg_ms).toBe(51) // (42 + 60) / 2 = 51
    // percentile 2개 샘플 → p95/p99 는 max 값 근처
    expect(portfolio.p95_ms).toBe(60)
  })

  it('errorRate = 에러 라인 / 총 라인 (warn+error+fatal 카운트)', () => {
    // 3 error 이상 / 5 = 0.6
    expect(stats.errorRate).toBeCloseTo(0.6)
  })

  it('빈 입력 → 0/0 반환, errorRate=0', () => {
    const s = computeStats([])
    expect(s.total).toBe(0)
    expect(s.errorRate).toBe(0)
    expect(s.byLevel).toEqual([])
  })
})
