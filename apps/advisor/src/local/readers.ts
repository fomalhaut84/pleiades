// `local` 리더 레지스트리 (#872 · 015 V-4a · §3-1 원칙 1 · H-R1).
// 리더 = 통합 층 코드가 선언된 데이터만 읽어 MCP 도구로 내는 것. 읽을 위치는 location() 이 정하고 통합 층이 mcp-config args 로 넘기며(V-4b),
// 어느 선언이 이 리더를 고를 수 있는지(allowedDecl)는 여기 상수다 — 선언 JSON 에는 경로를 두지 않는다.
// **운영 레지스트리는 비어 있다**(사용자 2026-11-20) — ops 리더는 V-5 · hermes 리더는 V-6 에서 더한다. 시험은 가짜 리더를 주입한다.
import type { Tally } from "./fields";

export interface ToolSpec {
  /** 접두 없는 도구 이름 — 선언 tools.read 에 있어야 한다(쓰기 0 시험 ① · V-4b prepare) */
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ReaderCall {
  /** 모델에 돌려줄 텍스트 — 형식 불일치가 있으면 호스트가 쓰지 않는다 */
  text: string;
  tally: Tally;
}

export interface Reader {
  id: string;
  /** 이 리더를 고를 수 있는 유일한 선언 위치 — 저장소 루트 기준 디렉터리(예: `apps/hermes`) */
  allowedDecl: string;
  tools: readonly ToolSpec[];
  /**
   * 도구마다 고정값 디렉터리에서 성공해야 하는 인자 — 쓰기 0 시험 ③ 이 모든 도구를 이 인자로 부른다.
   * 고정값 디렉터리는 `src/local/__fixtures__/<id>/`(새 리더는 둘 다 함께 더한다 · 시험이 둘의 존재를 본다)
   */
  examples: Readonly<Record<string, Record<string, unknown>>>;
  /**
   * 읽을 위치 — 통합 층 비공개 루트에서 정하는 코드 상수 규칙(015 §3-1 원칙 1 · #873 V-4b). 절대경로여야 한다.
   * 통합 층(prepare · mcp-config)이 부르고 호스트에는 `--dir` 로 넘긴다 — 호스트는 env · 루트를 모른다
   */
  location(privateRoot: string): string;
  /** 읽기만 한다 · dir 은 통합 층이 정한 위치 · 던지면 호스트가 도구 결과 실패로 돌린다 */
  call(tool: string, args: Record<string, unknown>, dir: string): ReaderCall;
}

export type Registry = ReadonlyMap<string, Reader>;

/** 운영 레지스트리 — 비어 있다(V-4a) */
export const READERS: Registry = new Map<string, Reader>();
