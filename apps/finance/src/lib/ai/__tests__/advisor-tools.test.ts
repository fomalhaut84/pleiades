// pleiades#419: AI 호출의 기본 도구는 읽기뿐이다. 쓰기 도구는 사람이 확인하는 봇 대화만 받는다.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { advisorToolArgs, READ_TOOLS, WRITE_TOOLS } from '../advisor-tools'

const SRC = join(__dirname, '..', '..', '..')
const WRITE_NAME = /__(create|update|delete|add|set|vest|exercise)_/

function argValue(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i < 0 ? undefined : args[i + 1]
}

describe('도구 목록', () => {
  it('운영 MCP 59개를 읽기 25 · 쓰기 34 로 나눈다', () => {
    expect(READ_TOOLS.filter((t) => t.startsWith('mcp__'))).toHaveLength(25)
    expect(WRITE_TOOLS).toHaveLength(34)
    expect(new Set([...READ_TOOLS, ...WRITE_TOOLS]).size).toBe(READ_TOOLS.length + WRITE_TOOLS.length)
  })

  it('읽기 목록에 쓰기 이름이 없고 쓰기 목록은 전부 쓰기 이름이다', () => {
    expect(READ_TOOLS.filter((t) => WRITE_NAME.test(t))).toEqual([])
    expect(WRITE_TOOLS.filter((t) => !WRITE_NAME.test(t))).toEqual([])
  })

  it('MCP 서버의 도구는 전부 어느 한쪽에 있다 — 새 도구가 분류 없이 빠지지 않는다', () => {
    const server = readFileSync(join(SRC, 'mcp', 'server.ts'), 'utf8')
    const names = [...server.matchAll(/server\.tool\(\s*['"](\w+)['"]/g)].map((m) => `mcp__myfinance__${m[1]}`)
    expect(names).toHaveLength(59)
    const known = new Set<string>([...READ_TOOLS, ...WRITE_TOOLS])
    expect(names.filter((n) => !known.has(n))).toEqual([])
  })
})

describe('advisorToolArgs', () => {
  it('기본은 읽기만 허용하고 쓰기를 명시 금지한다', () => {
    const args = advisorToolArgs(false)
    const allowed = argValue(args, '--allowedTools') ?? ''
    expect(allowed.split(',').filter((t) => WRITE_NAME.test(t))).toEqual([])
    expect(allowed).toContain('mcp__myfinance__get_portfolio')
    expect(allowed).toContain('WebSearch')
    expect(argValue(args, '--disallowedTools')?.split(',').sort()).toEqual([...WRITE_TOOLS].sort())
  })

  it('쓰기 허용은 목록에 더하고 금지 인자를 두지 않는다', () => {
    const args = advisorToolArgs(true)
    expect(argValue(args, '--allowedTools')).toContain('mcp__myfinance__create_transaction')
    expect(args).not.toContain('--disallowedTools')
  })
})

describe('호출부', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name)
      if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(full)
      return /\.tsx?$/.test(e.name) ? [full] : []
    })
  }

  it('쓰기 허용을 켜는 곳은 봇 AI 대화 하나뿐이다', () => {
    const on = sourceFiles(SRC).filter((f) => /allowWriteTools:\s*true/.test(readFileSync(f, 'utf8')))
    expect(on.map((f) => relative(SRC, f))).toEqual([join('bot', 'commands', 'ai.ts')])
    const ai = readFileSync(join(SRC, 'bot/commands/ai.ts'), 'utf8')
    expect(ai.match(/allowWriteTools: true/g)).toHaveLength(1)
    // 대화 호출에만 붙었다 — 파서(TRADE_PARSE_PROMPT) 호출에는 없다
    expect(ai.indexOf('allowWriteTools: true')).toBeLessThan(ai.indexOf('TRADE_PARSE_PROMPT + text'))
  })
})
