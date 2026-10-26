/**
 * 회귀: #247 — 모노레포 전환 뒤 CLI cwd 상위의 루트 CLAUDE.md·.claude/rules 가 매 호출
 * 컨텍스트에 붙어 TA 가이드(haiku · $0.10)가 error_max_budget_usd 로 전부 실패했다.
 * 루트 문서만 claudeMdExcludes 로 빼고, 실패하면 result subtype·비용을 남긴다.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { monorepoExcludeArgs } from '../cli-isolation'
import { classifyResultFailure, describeResultFailure, parseClaudeStreamJson } from '../claude-advisor'

const pkg = (name: string) => () => JSON.stringify({ name })

describe('monorepoExcludeArgs', () => {
  it('두 단계 위가 pleiades 루트면 루트 CLAUDE.md·rules 를 claudeMdExcludes 로 넘긴다', () => {
    const args = monorepoExcludeArgs('/srv/pleiades-fin/apps/finance', pkg('pleiades'))
    expect(args[0]).toBe('--settings')
    expect(JSON.parse(args[1])).toEqual({
      claudeMdExcludes: [
        '/srv/pleiades-fin/CLAUDE.md',
        '/srv/pleiades-fin/CLAUDE.local.md',
        '/srv/pleiades-fin/.claude/CLAUDE.md',
        '/srv/pleiades-fin/.claude/rules/**',
      ],
    })
  })

  it('앱 자신의 CLAUDE.md·rules 는 제외하지 않는다 (전환 전 컨텍스트 유지)', () => {
    const [, settings] = monorepoExcludeArgs('/srv/p/apps/finance', pkg('pleiades'))
    expect(settings).not.toContain('apps/finance')
  })

  it('루트 이름이 다르면 인자 없음', () => {
    expect(monorepoExcludeArgs('/srv/x/apps/finance', pkg('myfinance'))).toEqual([])
  })

  it('루트 package.json 이 없거나 깨졌으면 인자 없음', () => {
    expect(monorepoExcludeArgs('/srv/x/apps/finance', () => { throw new Error('ENOENT') })).toEqual([])
    expect(monorepoExcludeArgs('/srv/x/apps/finance', () => '{not json')).toEqual([])
  })

  it('이 저장소 안에서는 실제로 제외 인자가 붙는다', () => {
    const appDir = path.resolve(__dirname, '../../../..')
    expect(monorepoExcludeArgs(appDir)[0]).toBe('--settings')
  })
})

describe('askAdvisor 명령 조립 (소스 검사)', () => {
  const src = readFileSync(path.resolve(__dirname, '../claude-advisor.ts'), 'utf-8')

  it('sh -c 문자열에 제외 인자를 shellEscape 해서 넣는다 — 기준은 spawn cwd 와 같은 projectRoot', () => {
    expect(src).toMatch(/\.\.\.monorepoExcludeArgs\(projectRoot\)\.map\(shellEscape\)/)
    expect(src).toMatch(/cwd:\s*projectRoot/)
  })
})

describe('describeResultFailure', () => {
  it('예산 초과 result 의 subtype·종료 사유·비용·턴을 요약한다', () => {
    expect(describeResultFailure({
      subtype: 'error_max_budget_usd',
      terminal_reason: 'budget_exhausted',
      total_cost_usd: 0.10234,
      num_turns: 1,
    })).toBe('subtype=error_max_budget_usd terminal_reason=budget_exhausted cost=$0.1023 turns=1')
  })

  it('result event 가 없으면 result=none', () => {
    expect(describeResultFailure(undefined)).toBe('result=none')
  })

  it('필드가 비면 subtype=unknown 만 남긴다', () => {
    expect(describeResultFailure({})).toBe('subtype=unknown')
  })

  it('stream-json 의 마지막 result event 에서 subtype·terminal_reason 을 읽는다', () => {
    const stdout = [
      JSON.stringify({ type: 'system', subtype: 'init' }),
      JSON.stringify({
        type: 'result',
        subtype: 'error_max_budget_usd',
        terminal_reason: 'budget_exhausted',
        is_error: true,
        total_cost_usd: 0.0123,
        errors: ['Reached maximum budget ($0.01)'],
      }),
    ].join('\n')
    const { finalResult } = parseClaudeStreamJson(stdout)
    expect(describeResultFailure(finalResult)).toBe(
      'subtype=error_max_budget_usd terminal_reason=budget_exhausted cost=$0.0123',
    )
  })
})

describe('classifyResultFailure', () => {
  it('error_max_budget_usd 는 텍스트와 무관하게 quota_exceeded (기존 총 예산 cap 초과와 같은 분류)', () => {
    expect(classifyResultFailure({ subtype: 'error_max_budget_usd' }, 'Reached maximum budget ($0.10)')).toBe('quota_exceeded')
    expect(classifyResultFailure({ subtype: 'error_max_budget_usd' }, undefined)).toBe('quota_exceeded')
  })

  it('그 외 subtype 은 기존 텍스트 분류를 따른다', () => {
    expect(classifyResultFailure({ subtype: 'error_during_execution' }, 'Error: not logged in')).toBe('auth_expired')
    expect(classifyResultFailure(undefined, 'connect ECONNREFUSED 127.0.0.1:4210')).toBe('server_down')
    expect(classifyResultFailure({ subtype: 'error_max_turns' }, undefined)).toBe('unknown')
  })
})
