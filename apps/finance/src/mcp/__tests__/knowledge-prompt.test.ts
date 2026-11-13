// #657(012 4a-3a): 도메인 지식 prompt — 읽기 경로에만 · 핸들러 안에서 읽는다 · 실패는 그 prompt 의 오류로만.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, it } from 'vitest'
import {
  buildDomainKnowledge,
  DOMAIN_KNOWLEDGE_PROMPT,
  extractSection,
  KNOWLEDGE_READ_ERROR,
  registerDomainKnowledgePrompt,
} from '../knowledge-prompt'

function recordingLog(): { entries: Array<{ obj: object; msg: string }>; error: (obj: object, msg: string) => void } {
  const entries: Array<{ obj: object; msg: string }> = []
  return { entries, error: (obj, msg) => { entries.push({ obj, msg }) } }
}

const APP_DIR = join(__dirname, '..', '..', '..')
const SERVER_SRC = readFileSync(join(__dirname, '..', 'server.ts'), 'utf8')

function fakeApp(opts: { section?: boolean; tax?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'fin-knowledge-'))
  mkdirSync(join(dir, '.claude', 'rules'), { recursive: true })
  writeFileSync(join(dir, '.claude', 'rules', 'stock-trading-method.md'), '# 매매\n원칙 A\n')
  if (opts.tax !== false) writeFileSync(join(dir, '.claude', 'rules', 'tax-logic.md'), '# 세금\n규칙 B\n')
  const section = opts.section === false ? '' : '## Key Domain Rules\n\n- 규칙 C\n\n'
  writeFileSync(join(dir, 'CLAUDE.md'), `# 앱\n\n## Overview\n개요\n\n${section}## Coding Conventions\n개발 규칙 D\n`)
  return dir
}

async function connected(server: McpServer): Promise<{ client: Client; close: () => Promise<void> }> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await server.connect(serverSide)
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  await client.connect(clientSide)
  return { client, close: async () => { await client.close(); await server.close() } }
}

describe('extractSection', () => {
  it('제목 줄부터 다음 ## 앞까지만', () => {
    expect(extractSection('# t\n## A\na1\n### sub\na2\n## B\nb', '## A')).toBe('## A\n\na1\n### sub\na2')
  })
  it('코드 펜스 안의 ## 는 경계가 아니다 (#657 9-1)', () => {
    expect(extractSection('## A\na\n```md\n## 예시\n```\nb\n## B\nc', '## A')).toBe('## A\n\na\n```md\n## 예시\n```\nb')
  })
  it('마지막 절 · 없는 절 · 빈 절', () => {
    expect(extractSection('## A\na', '## A')).toBe('## A\n\na')
    expect(extractSection('## B\nb', '## A')).toBeNull()
    expect(extractSection('## A\n\n## B', '## A')).toBeNull()
  })
})

describe('buildDomainKnowledge', () => {
  it('도메인 규칙 절 + rules 두 파일 — 개발 규칙 절은 싣지 않는다', async () => {
    const text = await buildDomainKnowledge(fakeApp())
    expect(text).toBe('## Key Domain Rules\n\n- 규칙 C\n\n---\n\n# 매매\n원칙 A\n\n---\n\n# 세금\n규칙 B')
    expect(text).not.toContain('개발 규칙 D')
    expect(text).not.toContain('개요')
  })

  it('실제 앱 디렉터리에서도 세 출처를 모두 읽는다', async () => {
    const text = await buildDomainKnowledge(APP_DIR)
    expect(text.startsWith('## Key Domain Rules\n')).toBe(true)
    // 절은 다음 ## 앞에서 끝난다 — 개발 규칙 절이 섞이지 않는다
    expect(text.split('\n\n---\n\n')[0]).not.toMatch(/\n## (?!Key Domain Rules)/)
    expect(text).toContain(readFileSync(join(APP_DIR, '.claude/rules/tax-logic.md'), 'utf8').trim())
    expect(text).toContain(readFileSync(join(APP_DIR, '.claude/rules/stock-trading-method.md'), 'utf8').trim())
  })

  it('출처가 없으면 throw — 빈 지식을 정상처럼 내지 않는다', async () => {
    await expect(buildDomainKnowledge(fakeApp({ section: false }))).rejects.toThrow(/Key Domain Rules/)
    await expect(buildDomainKnowledge(fakeApp({ tax: false }))).rejects.toThrow()
  })
})

describe('prompt 등록', () => {
  it('prompts/get 이 지식 본문을 돌려준다', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerDomainKnowledgePrompt(server, recordingLog(), fakeApp())
    const { client, close } = await connected(server)
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual([DOMAIN_KNOWLEDGE_PROMPT])
    const got = await client.getPrompt({ name: DOMAIN_KNOWLEDGE_PROMPT })
    expect(got.messages[0].content).toMatchObject({ type: 'text', text: expect.stringContaining('규칙 C') })
    await close()
  })

  it('읽기 실패는 그 prompt 의 오류로만 끝나고 세션은 계속 쓸 수 있다', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    server.tool('get_portfolio', 'x', async () => ({ content: [] }))
    const log = recordingLog()
    const dir = fakeApp({ tax: false })
    registerDomainKnowledgePrompt(server, log, dir)
    const { client, close } = await connected(server)
    // 클라이언트에는 정적 문구만 — 서버 경로가 나가지 않는다 · 원인은 서버 로그에 (#657 9-1)
    const err = await client.getPrompt({ name: DOMAIN_KNOWLEDGE_PROMPT }).catch((e: Error) => e)
    expect(String(err)).toContain(KNOWLEDGE_READ_ERROR)
    expect(String(err)).not.toContain(dir)
    expect(log.entries).toHaveLength(1)
    expect(log.entries[0].msg).toBe('prompt_failed')
    expect(JSON.stringify(log.entries[0].obj)).toContain('tax-logic.md')
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['get_portfolio'])
    await close()
  })
})

describe('server.ts 결선', () => {
  it('prompt 는 읽기 모드에서만 등록된다 — 전체 경로(앱 advisor)의 맥락은 그대로', () => {
    expect(SERVER_SRC.match(/registerDomainKnowledgePrompt\(/g)).toHaveLength(1)
    expect(SERVER_SRC).toContain("if (mode === 'read') registerDomainKnowledgePrompt(server, logger)")
  })

  it('모듈 최상위에서 지식 파일을 읽지 않는다 — 읽기는 핸들러 안', () => {
    const src = readFileSync(join(__dirname, '..', 'knowledge-prompt.ts'), 'utf8')
    const topLevel = src.split('\n').filter((line) => /^(const|let|var|await)\b/.test(line))
    expect(topLevel.filter((line) => /readFile|buildDomainKnowledge/.test(line))).toEqual([])
  })
})
