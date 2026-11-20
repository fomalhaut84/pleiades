// 시험용 mcp 선언 — 필드가 늘어도(#858 V-3) 시험마다 다시 적지 않게.
import { McpDecl } from "../../domains";

export const mcpDecl = (over: Partial<McpDecl> = {}): McpDecl => ({
  kind: "mcp", dir: "finance", id: "fin", name: "재무", summary: "", enabled: true, keySuffix: "FINANCE", serverKey: "myfinance",
  port: 1, portKey: "ADVISOR_MCP_PORT_FINANCE", write: new Set(), propose: new Set(), knowledge: true, models: null, ...over,
});
