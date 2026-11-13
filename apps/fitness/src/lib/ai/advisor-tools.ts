// 어드바이저 (Claude CLI) 가 승인 없이 쓰는 MCP 도구 — `claude-advisor.ts` --allowedTools 와 #552 프롬프트 검증 (모르는 도구 경고) 이 공유한다.
// 주의: 여기 나열된 도구는 승인 프롬프트 없이 실행됨. mutating 도구(generate_training_plan
// 등) 는 스케줄 리포트/일반 채팅에서 의도치 않게 상태를 바꿀 수 있으므로 여기에 포함하지 않음.
// Plan 생성은 명시적 진입점 (POST /api/training-plan/generate) 에서 처리하고,
// AI 는 read-only get_active_training_plan 만 사용.
// #377 Codex P1: 새 read-only 도구는 allowlist 에 있어야 -p 비대화형에서 승인 없이 실행된다 — 지금은 domain.json tools.read 에 분류한다(#653).
//   verify-mcp-long-history [7] 이 server.ts 등록 도구와 분류의 불일치를 양방향으로 잡는다.
// #653(012 4a-1 · K-2): 분류의 정본은 앱 루트 `domain.json` 의 `tools.read`(= 이 목록)·`tools.write`(= 제외 목록)다.
//   새 도구는 domain.json 에 분류한다 — 여기는 접두를 붙일 뿐이고 값은 옮기기 전과 같다.
import domain from "../../../domain.json";

const MCP_PREFIX = `mcp__${domain.mcp.serverKey}__`;

export const ADVISOR_ALLOWED_TOOLS: readonly string[] = domain.tools.read.map((name) => `${MCP_PREFIX}${name}`);

/** 일부러 allowlist 에서 뺀 mutating 도구 — 프롬프트가 "호출하지 마세요" 로 언급하는 건 정상이라 #552 검증 경고에서 제외 */
export const ADVISOR_EXCLUDED_TOOLS: readonly string[] = domain.tools.write.map((name) => `${MCP_PREFIX}${name}`);
