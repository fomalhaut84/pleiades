// #657(012 4a-3a · Q135 · 계약 K-3): 도메인 지식 MCP prompt `domain_knowledge` — 읽기 경로(`/mcp/read`)에서만 등록한다.
// 통합 층이 세션 시작에 `prompts/get` 으로 받아 시스템 프롬프트에 싣는다(모델 턴 0 · 도구 수·분류 무변경).
//
// 출처: DB `PromptVersion` key "system" 의 사용 중(active) 본문 — 없거나 조회 실패면 코드 기본값.
// 앱 advisor 의 `resolvePromptTemplate("system")`(lib/prompts/resolve.ts)과 같은 규칙이지만, 그 모듈은 `@/lib/prisma` 를 쓰므로
// MCP 프로세스의 Prisma 클라이언트(./prisma)로 같은 조회를 한다 — 한 프로세스에 클라이언트를 둘 만들지 않는다.
// 사용자 프로필 절·동적 맥락(개인 목표·시각)은 싣지 않는다 — 그것은 읽기 도구(get_user_profile · get_personal_goals)의 몫이다.
//
// 지식은 핸들러 안에서 읽는다 — 모듈 로드·팩토리에서 읽지 않는다(012 R3-6). 조회 실패는 코드 기본값으로 답하고,
// 기본값으로 답한 사실과 이유는 서버 로그(warn)에 남긴다 — 통합 층이 사용 중 본문 대신 기본값을 받는 것을 운영에서 구분하게(#657 9-1).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SYSTEM_PROMPT_DEFAULT } from "../lib/prompts/defaults/system";

export const DOMAIN_KNOWLEDGE_PROMPT = "domain_knowledge";

/** 서버 로그(pino logger 의 부분) — 주입받아 이 모듈이 logger 를 import 하지 않는다 */
export interface PromptLog {
  warn(obj: object, msg: string): void;
}

export type FallbackReason = "no_active" | "query_failed" | "db_unavailable";

export interface DomainKnowledge {
  text: string;
  fallback: boolean;
  reason?: FallbackReason;
  error?: string;
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** 사용 중 본문을 찾는 최소 접근자 — 시험에서 가짜를 넘길 수 있게 Prisma 전체 대신 이 모양만 받는다. */
export interface ActivePromptReader {
  promptVersion: {
    findFirst(args: {
      where: { key: string; status: string };
      select: { body: true };
    }): Promise<{ body: string } | null>;
  };
}

export async function buildDomainKnowledge(db: ActivePromptReader): Promise<DomainKnowledge> {
  try {
    const row = await db.promptVersion.findFirst({ where: { key: "system", status: "active" }, select: { body: true } });
    if (row?.body) return { text: row.body, fallback: false };
    return { text: SYSTEM_PROMPT_DEFAULT, fallback: true, reason: "no_active" };
  } catch (error) {
    // 조회 실패 — 앱 advisor 와 같이 코드 기본값으로 답한다(resolve.ts)
    return { text: SYSTEM_PROMPT_DEFAULT, fallback: true, reason: "query_failed", error: errorMessage(error) };
  }
}

/** `loadDb` 는 핸들러 안에서 부른다 — Prisma 모듈 로드도 prompt 요청 때까지 미룬다. */
export function registerDomainKnowledgePrompt(
  server: McpServer,
  loadDb: () => Promise<ActivePromptReader>,
  log: PromptLog,
): void {
  server.registerPrompt(
    DOMAIN_KNOWLEDGE_PROMPT,
    {
      title: "건강 도메인 지식",
      description: "건강(fit) 도메인 답변 지식 — 어드바이저 시스템 프롬프트의 사용 중 본문. 통합 어드바이저가 세션 시작에 싣는다.",
    },
    async () => {
      let result: DomainKnowledge;
      try {
        result = await buildDomainKnowledge(await loadDb());
      } catch (error) {
        result = { text: SYSTEM_PROMPT_DEFAULT, fallback: true, reason: "db_unavailable", error: errorMessage(error) };
      }
      if (result.fallback) {
        log.warn({ prompt: DOMAIN_KNOWLEDGE_PROMPT, fallback: true, reason: result.reason, err: result.error }, "prompt_fallback");
      }
      return { messages: [{ role: "user" as const, content: { type: "text" as const, text: result.text } }] };
    },
  );
}
