// stream-json 줄 만들기 — CLI 가 내는 모양(X1 이 서버 CLI 로 확인한 필드)만.
export const initLine = (tools: string[], servers: string[], extra: Record<string, unknown> = {}) => ({
  type: "system", subtype: "init", tools, mcp_servers: servers.map((name) => ({ name, status: "connected" })), plugins: [], ...extra,
});
export const toolUse = (id: string, name: string) => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input: {} }] } });
export const toolResult = (id: string, isError = false) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: isError }] } });
export const resultLine = (extra: Record<string, unknown> = {}) => ({
  type: "result", subtype: "success", is_error: false, result: "답입니다", session_id: "11111111-2222-3333-4444-555555555555",
  total_cost_usd: 0.1234, num_turns: 3, usage: { input_tokens: 1200 }, ...extra,
});
