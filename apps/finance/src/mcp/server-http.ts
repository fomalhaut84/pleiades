/**
 * Phase 32-A PoC — HTTP transport MCP 서버 (실험용, 임시).
 *
 * 목적: Claude CLI 가 `mcp-config.http.json` 의 http URL 로 MCP 서버에 붙어
 * tool 호출 성공하는지 검증. 성공하면 32-B 에서 정식 도입.
 *
 * 이 파일은 32-A PoC 완료 후 정리 (제거 또는 정식 server.ts 로 통합).
 * 최소 2 tool (get_portfolio + echo_test) 만 등록.
 *
 * Multi-session 패턴: 각 initialize 요청에 새 transport + server 생성 →
 * mcp-session-id 헤더로 라우팅. Claude CLI 가 여러 세션을 생성해도 대응.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { getPortfolio } from './tools/portfolio'

const PORT = parseInt(process.env.MCP_PORT ?? '4200', 10)
const HOST = '127.0.0.1'

/** 새 MCP server 인스턴스 생성 (세션마다 fresh) */
function createMcpServer(): McpServer {
  const s = new McpServer({
    name: 'myfinance-poc',
    version: '0.0.1-poc',
  })

  s.tool(
    'echo_test',
    '[PoC] transport 검증용 echo',
    { message: z.string().describe('입력 문자열') },
    async (args) => ({
      content: [{ type: 'text' as const, text: `echo: ${args.message}` }],
    }),
  )

  s.tool(
    'get_portfolio',
    '계좌별 보유 종목 + 현재가 + 손익',
    { account_name: z.enum(['세진', '소담', '다솜', '전체']).describe('계좌명') },
    async (args) => getPortfolio(args),
  )

  return s
}

// sessionId → transport 매핑
const transports = new Map<string, StreamableHTTPServerTransport>()

async function main() {
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/'

    // Health check
    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, uptime: process.uptime(), sessions: transports.size }))
      return
    }

    // MCP endpoint
    if (url === '/mcp' || url.startsWith('/mcp?')) {
      const t0 = Date.now()
      const sessionIdHeader = (req.headers['mcp-session-id'] as string | undefined) ?? null
      try {
        let body: unknown
        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const bodyText = Buffer.concat(chunks).toString('utf-8')
          body = bodyText ? JSON.parse(bodyText) : undefined
        }

        const method = (body as { method?: string } | undefined)?.method ?? '(no-body)'
        const isInit = method === 'initialize'
        console.log(`[mcp-poc] ${req.method} /mcp method=${method} session=${sessionIdHeader ?? '(new)'}`)

        let transport: StreamableHTTPServerTransport | undefined

        if (sessionIdHeader && transports.has(sessionIdHeader)) {
          // 기존 세션 재사용
          transport = transports.get(sessionIdHeader)
        } else if (isInit && !sessionIdHeader) {
          // 새 세션 생성
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid: string) => {
              transports.set(sid, transport!)
              console.log(`[mcp-poc] session initialized: ${sid} (total=${transports.size})`)
            },
          })
          transport.onclose = () => {
            const sid = transport!.sessionId
            if (sid) {
              transports.delete(sid)
              console.log(`[mcp-poc] session closed: ${sid} (total=${transports.size})`)
            }
          }
          const s = createMcpServer()
          await s.connect(transport)
        } else {
          // sessionId 없이 non-init 요청 → 잘못된 상태
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32600, message: 'Bad Request: no session id and not initialize' },
            id: null,
          }))
          return
        }

        await transport!.handleRequest(req, res, body)
        console.log(`[mcp-poc] ${method} done in ${Date.now() - t0}ms`)
        return
      } catch (error) {
        console.error('[mcp-poc] request handling error:', error)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'internal_error' }))
        }
        return
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not_found', url }))
  })

  httpServer.listen(PORT, HOST, () => {
    console.log(`[mcp-poc] listening at http://${HOST}:${PORT}/mcp`)
    console.log(`[mcp-poc] health: http://${HOST}:${PORT}/health`)
  })
}

main().catch((error) => {
  console.error('[mcp-poc] fatal:', error)
  process.exit(1)
})
