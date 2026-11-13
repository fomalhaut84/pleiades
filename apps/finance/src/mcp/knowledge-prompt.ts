// #657(012 4a-3a · Q135 · 계약 K-3): 도메인 지식 MCP prompt `domain_knowledge` — 읽기 경로(`/mcp/read`)에서만 등록한다.
// 통합 층이 세션 시작에 `prompts/get` 으로 받아 시스템 프롬프트에 싣는다(모델 턴 0 · 도구 수·분류 무변경).
//
// 출처는 앱 cwd(pm2 정의상 apps/finance)의 파일 세 곳을 **제자리에서** 읽는다:
//   .claude/rules/stock-trading-method.md · .claude/rules/tax-logic.md · CLAUDE.md 의 `## Key Domain Rules` 절.
// 이 파일들은 앱 개발 문서이기도 하다 — 고치면 통합 층 답이 바뀐다. 이 결합은 4a-3b(fin 지식 이전 · 선택)가 푼다.
// (pleiades 세션은 apps/* 하네스 지시를 실행하지 않는다 — isolation.md I-10. 여기서 읽는 것은 런타임 데이터다.)
//
// 지식은 핸들러 안에서 읽는다 — 모듈 로드·팩토리에서 읽으면 실패가 두 경로가 함께 쓰는 팩토리나 프로세스를 멈춘다(012 R3-6).
// 읽기 실패는 이 prompt 의 오류로만 끝난다 — 원인(파일 경로 포함)은 서버 로그에만 남기고 클라이언트에는 정적 문구만 준다
// (통합 층이 오류를 모델 맥락·Discord 로 옮겨도 서버 경로가 나가지 않게 · #657 9-1).
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const DOMAIN_KNOWLEDGE_PROMPT = 'domain_knowledge'
export const KNOWLEDGE_READ_ERROR = 'domain_knowledge: 지식 출처를 읽지 못했다'

/** 서버 로그(pino logger 의 부분) — 주입받아 이 모듈이 logger 를 import 하지 않는다 */
export interface PromptLog {
  error(obj: object, msg: string): void
}

const RULE_FILES = ['.claude/rules/stock-trading-method.md', '.claude/rules/tax-logic.md'] as const
const CLAUDE_MD = 'CLAUDE.md'
const DOMAIN_RULES_HEADING = '## Key Domain Rules'

/** `## <제목>` 절 하나(제목 줄 포함 · 다음 `## ` 앞까지 · 코드 펜스 안의 `## ` 는 경계가 아니다). 없으면 null. */
export function extractSection(markdown: string, heading: string): string | null {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => line.trim() === heading)
  if (start < 0) return null
  const body: string[] = []
  let inFence = false
  for (const line of lines.slice(start + 1)) {
    if (line.trimStart().startsWith('```')) inFence = !inFence
    if (!inFence && line.startsWith('## ')) break
    body.push(line)
  }
  const text = body.join('\n').trim()
  return text ? `${heading}\n\n${text}` : null
}

/** 지식 본문 조립. `appDir` 는 앱 루트(기본 = 프로세스 cwd). 출처가 하나라도 없으면 throw. */
export async function buildDomainKnowledge(appDir: string = process.cwd()): Promise<string> {
  const rules = await Promise.all(RULE_FILES.map((rel) => readFile(join(appDir, rel), 'utf8')))
  const section = extractSection(await readFile(join(appDir, CLAUDE_MD), 'utf8'), DOMAIN_RULES_HEADING)
  if (!section) throw new Error(`${CLAUDE_MD} 에 "${DOMAIN_RULES_HEADING}" 절이 없다`)
  return [section, ...rules.map((text) => text.trim())].join('\n\n---\n\n')
}

export function registerDomainKnowledgePrompt(server: McpServer, log: PromptLog, appDir?: string): void {
  server.registerPrompt(
    DOMAIN_KNOWLEDGE_PROMPT,
    {
      title: '재무 도메인 지식',
      description: '재무(fin) 도메인 답변 지식 — 매매 원칙 · 세금 규칙 · 도메인 규칙. 통합 어드바이저가 세션 시작에 싣는다.',
    },
    async () => {
      let text: string
      try {
        text = await buildDomainKnowledge(appDir)
      } catch (error) {
        log.error({ prompt: DOMAIN_KNOWLEDGE_PROMPT, err: error instanceof Error ? error.message : String(error) }, 'prompt_failed')
        throw new Error(KNOWLEDGE_READ_ERROR)
      }
      return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] }
    },
  )
}
