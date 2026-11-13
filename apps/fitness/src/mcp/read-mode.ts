// #655(012 4a-2 · Q133 · 계약 K-1): MCP 읽기 전용 경로 — fin `src/mcp/read-mode.ts` 와 같은 모양.
// `/mcp`(전체)는 그대로이고 `/mcp/read` 는 domain.json `tools.read` 의 도구만 등록한다 — mutating 도구는 그 세션에 없다.
// 클라이언트 settings 의 allow 규칙이 무엇이든 등록되지 않은 도구는 부를 수 없다(012 §4-3 C3+).
// 분류에 없는 도구(새로 등록했는데 분류를 빠뜨린 것)도 읽기 경로에는 나타나지 않는다 — 실패는 닫힌 쪽이다.
// 분류 오류(쓰기 도구를 read 로 적은 것)는 막지 못한다 — 그것은 등록 ↔ 분류 시험과 리뷰의 몫이다(012 §2-1).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import domain from "../../domain.json";

export type McpMode = "full" | "read";

export const MCP_FULL_PATH = "/mcp";
export const MCP_READ_PATH = "/mcp/read";

const READ_TOOL_NAMES: ReadonlySet<string> = new Set(domain.tools.read);

/** 요청 URL → 모드. MCP 경로가 아니면 null(404). 쿼리는 무시한다 — 옛 `/mcp?…` 동작과 같다. */
export function mcpModeForUrl(url: string): McpMode | null {
  const path = url.split("?", 1)[0];
  if (path === MCP_FULL_PATH) return "full";
  if (path === MCP_READ_PATH) return "read";
  return null;
}

export function isToolExposed(mode: McpMode, toolName: string): boolean {
  return mode === "full" || READ_TOOL_NAMES.has(toolName);
}

/**
 * 세션은 만든 경로의 모드에 묶인다. 위험한 방향은 전체 경로에서 만든 sid 를 읽기 경로로 보내 mutating 도구가 있는
 * 세션을 다시 쓰는 것이다(012 Q133). 반대 방향도 막는다 — 모드가 다르면 재사용하지 않는다.
 */
export function canReuseSession(sessionMode: McpMode, requestMode: McpMode): boolean {
  return sessionMode === requestMode;
}

/**
 * 읽기 모드면 `server.tool` 등록을 걸러 읽기 분류 도구만 실제로 등록한다. 등록 호출부(server.ts)는 바꾸지 않는다.
 * 계측 래퍼보다 **먼저** 건다 — 계측 래퍼가 이 함수가 바꾼 `server.tool` 을 감싼다.
 * `registerTool` 도 같은 규칙으로 거른다(#655 9-1 major — 새 등록 API 로 추가한 도구가 필터를 비켜 가지 않게).
 * 걸러진 등록은 반환값이 없다(`undefined`) — 읽기 모드에서 `RegisteredTool` 반환값을 쓰지 않는다.
 */
export function restrictToolRegistration(server: McpServer, mode: McpMode): void {
  if (mode === "full") return;
  const target = server as unknown as Record<string, unknown>;
  for (const method of ["tool", "registerTool"] as const) {
    const register = (server[method] as (...args: unknown[]) => unknown).bind(server);
    target[method] = (...args: unknown[]) => {
      const toolName = typeof args[0] === "string" ? args[0] : "";
      if (!isToolExposed(mode, toolName)) return undefined;
      return register(...args);
    };
  }
}

/**
 * 팩토리 끝(연결 전)의 마지막 겹 — 읽기 모드 서버에 실제로 등록된 도구가 전부 읽기 분류인지 본다.
 * 어떤 등록 경로로 들어왔든(등록 거르기를 비켜 간 새 API 포함) 어긋나면 throw 한다 → 그 세션은 만들어지지 않는다(HTTP 500 · 프로세스는 산다).
 * SDK 내부 필드(`_registeredTools`)를 읽는다 — 필드가 없으면(SDK 변경) 확인할 수 없으므로 역시 throw(닫힌 쪽).
 */
export function assertReadOnlyRegistration(server: McpServer, mode: McpMode): void {
  if (mode === "full") return;
  const registered = (server as unknown as { _registeredTools?: unknown })._registeredTools;
  if (!registered || typeof registered !== "object") {
    throw new Error("read mode: 등록된 도구를 확인할 수 없다(SDK 내부 변경)");
  }
  const outside = Object.keys(registered).filter((name) => !READ_TOOL_NAMES.has(name));
  if (outside.length > 0) {
    throw new Error(`read mode: 읽기 분류 밖 도구 ${outside.length}개가 등록됐다`);
  }
}
