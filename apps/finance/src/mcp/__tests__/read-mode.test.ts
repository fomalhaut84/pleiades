// #655(012 4a-2): MCP 읽기 전용 경로 — 읽기 세션에는 원장·설정 쓰기 도구가 등록되지 않는다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, it } from 'vitest'
import domain from '../../../domain.json'
import {
  assertReadOnlyRegistration,
  canReuseSession,
  isToolExposed,
  mcpModeForUrl,
  restrictToolRegistration,
  type McpMode,
} from '../read-mode'

const SERVER_SRC = readFileSync(join(__dirname, '..', 'server.ts'), 'utf8')
/** server.ts 가 실제로 등록하는 도구 이름(등록 순서) */
const REGISTERED = [...SERVER_SRC.matchAll(/server\.(?:tool|registerTool)\(\s*['"](\w+)['"]/g)].map((m) => m[1])

async function listedTools(mode: McpMode, names: readonly string[]): Promise<string[]> {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  restrictToolRegistration(server, mode)
  for (const name of names) server.tool(name, 'test', async () => ({ content: [] }))
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await server.connect(serverSide)
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  await client.connect(clientSide)
  const { tools } = await client.listTools()
  await client.close()
  await server.close()
  return tools.map((t) => t.name).sort()
}

describe('읽기 모드 등록', () => {
  it('server.ts 의 전체 등록을 읽기 모드로 돌리면 읽기 분류만 남고 쓰기는 0 이다', async () => {
    expect(REGISTERED).toHaveLength(59)
    const listed = await listedTools('read', REGISTERED)
    expect(listed).toEqual([...domain.tools.read].sort())
    expect(listed.filter((n) => domain.tools.write.includes(n))).toEqual([])
  })

  it('전체 모드는 모든 도구를 그대로 등록한다 — /mcp 무변경', async () => {
    expect(await listedTools('full', REGISTERED)).toEqual([...REGISTERED].sort())
  })

  it('분류에 없는 도구는 읽기 모드에 나타나지 않는다 — 분류를 빠뜨려도 닫힌 쪽', async () => {
    expect(await listedTools('read', ['get_portfolio', 'drop_everything'])).toEqual(['get_portfolio'])
    expect(isToolExposed('read', 'drop_everything')).toBe(false)
    expect(isToolExposed('full', 'drop_everything')).toBe(true)
  })
})

describe('등록 경로 전부 · 마지막 대조 (#655 9-1 major)', () => {
  it('registerTool 로 등록한 쓰기 도구도 읽기 모드에 나타나지 않는다', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    restrictToolRegistration(server, 'read')
    server.registerTool('create_transaction', { description: 'x' }, async () => ({ content: [] }))
    server.registerTool('get_portfolio', { description: 'x' }, async () => ({ content: [] }))
    expect(() => assertReadOnlyRegistration(server, 'read')).not.toThrow()
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await server.connect(serverSide)
    const client = new Client({ name: 'test-client', version: '0.0.0' })
    await client.connect(clientSide)
    const { tools } = await client.listTools()
    await client.close()
    await server.close()
    expect(tools.map((t) => t.name)).toEqual(['get_portfolio'])
  })

  it('거르기를 비켜 간 쓰기 도구가 있으면 마지막 대조가 throw 한다 — 세션을 만들지 않는다', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    server.tool('create_transaction', 'x', async () => ({ content: [] })) // 거르기 전에 등록 = 비켜 간 경로
    restrictToolRegistration(server, 'read')
    expect(() => assertReadOnlyRegistration(server, 'read')).toThrow(/읽기 분류 밖 도구 1개/)
    expect(() => assertReadOnlyRegistration(server, 'full')).not.toThrow()
  })

  it('SDK 내부 필드가 없으면 확인할 수 없으므로 throw 한다 — 닫힌 쪽', () => {
    const fake = {} as unknown as McpServer
    expect(() => assertReadOnlyRegistration(fake, 'read')).toThrow(/확인할 수 없다/)
  })
})

describe('경로 → 모드', () => {
  it.each([
    ['/mcp', 'full'],
    ['/mcp?x=1', 'full'],
    ['/mcp/read', 'read'],
    ['/mcp/read?x=1', 'read'],
    ['/mcp/', null],
    ['/mcp/readx', null],
    ['/mcpx', null],
    ['/mcp/read/x', null],
    ['/health', null],
    ['/', null],
  ])('%s → %s', (url, mode) => {
    expect(mcpModeForUrl(url)).toBe(mode)
  })
})

describe('세션 모드 대조', () => {
  it('같은 모드만 재사용한다 — 전체 경로 세션을 읽기 경로로 쓸 수 없다', () => {
    expect(canReuseSession('full', 'read')).toBe(false)
    expect(canReuseSession('read', 'full')).toBe(false)
    expect(canReuseSession('read', 'read')).toBe(true)
    expect(canReuseSession('full', 'full')).toBe(true)
  })
})

describe('server.ts 결선', () => {
  it('등록 거르기는 계측 래퍼보다 먼저 걸린다', () => {
    const restrict = SERVER_SRC.indexOf('restrictToolRegistration(server, mode)')
    const instrument = SERVER_SRC.indexOf('const originalTool = server.tool.bind(server)')
    expect(restrict).toBeGreaterThan(0)
    expect(restrict).toBeLessThan(instrument)
  })

  it('HTTP 는 경로의 모드로 세션 서버를 만들고 모드를 기록하며 재사용 때 대조한다', () => {
    expect(SERVER_SRC).toContain('const mode = mcpModeForUrl(url)')
    expect(SERVER_SRC).toContain('createMyFinanceMcpServer(mode)')
    expect(SERVER_SRC).toMatch(/transports\.set\(sid, \{[^}]*mode \}\)/)
    expect(SERVER_SRC).toContain('if (!canReuseSession(entry.mode, mode))')
  })

  it('팩토리는 연결 전에 읽기 모드 등록을 마지막으로 대조한다', () => {
    expect(SERVER_SRC).toMatch(/assertReadOnlyRegistration\(server, mode\)\n\n  return server\n\}/)
  })

  it('stdio 는 전체 모드 그대로다', () => {
    expect(SERVER_SRC).toMatch(/async function startStdio\(\)[\s\S]*?const server = createMyFinanceMcpServer\(\)\n/)
  })
})
