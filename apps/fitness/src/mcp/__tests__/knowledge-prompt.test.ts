// #657(012 4a-3a): 도메인 지식 prompt — 읽기 경로에만 · 사용 중 본문 · 없거나 실패면 코드 기본값.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT_DEFAULT } from "../../lib/prompts/defaults/system";
import {
  buildDomainKnowledge,
  DOMAIN_KNOWLEDGE_PROMPT,
  registerDomainKnowledgePrompt,
  type ActivePromptReader,
} from "../knowledge-prompt";

const SERVER_SRC = readFileSync(join(__dirname, "..", "server.ts"), "utf8");

function recordingLog(): { entries: Array<{ obj: object; msg: string }>; warn: (obj: object, msg: string) => void } {
  const entries: Array<{ obj: object; msg: string }> = [];
  return { entries, warn: (obj, msg) => { entries.push({ obj, msg }); } };
}

async function connect(server: McpServer): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

function fakeDb(result: { body: string } | null | Error, seen: unknown[] = []): ActivePromptReader {
  return {
    promptVersion: {
      findFirst: async (args) => {
        seen.push(args);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

describe("buildDomainKnowledge", () => {
  it("system 의 사용 중 본문을 쓴다", async () => {
    const seen: unknown[] = [];
    expect(await buildDomainKnowledge(fakeDb({ body: "사용 중 본문" }, seen))).toEqual({ text: "사용 중 본문", fallback: false });
    expect(seen).toEqual([{ where: { key: "system", status: "active" }, select: { body: true } }]);
  });

  it("사용 중 버전이 없거나 조회가 실패하면 코드 기본값 — 앱 advisor 와 같은 규칙", async () => {
    expect(await buildDomainKnowledge(fakeDb(null))).toEqual({ text: SYSTEM_PROMPT_DEFAULT, fallback: true, reason: "no_active" });
    expect(await buildDomainKnowledge(fakeDb(new Error("db down")))).toEqual({
      text: SYSTEM_PROMPT_DEFAULT,
      fallback: true,
      reason: "query_failed",
      error: "db down",
    });
  });
});

describe("prompt 등록", () => {
  it("prompts/get 이 본문을 돌려주고 DB 는 요청 때 연다", async () => {
    let loads = 0;
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const log = recordingLog();
    registerDomainKnowledgePrompt(
      server,
      async () => {
        loads++;
        return fakeDb({ body: "사용 중 본문" });
      },
      log,
    );
    expect(loads).toBe(0);
    const client = await connect(server);
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual([DOMAIN_KNOWLEDGE_PROMPT]);
    const got = await client.getPrompt({ name: DOMAIN_KNOWLEDGE_PROMPT });
    expect(got.messages[0].content).toEqual({ type: "text", text: "사용 중 본문" });
    expect(loads).toBe(1);
    expect(log.entries).toEqual([]);
    await client.close();
    await server.close();
  });

  it("기본값으로 답하면 이유를 서버 로그(warn)에 남긴다 (#657 9-1)", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const log = recordingLog();
    registerDomainKnowledgePrompt(server, async () => fakeDb(null), log);
    const client = await connect(server);
    const got = await client.getPrompt({ name: DOMAIN_KNOWLEDGE_PROMPT });
    expect(got.messages[0].content).toEqual({ type: "text", text: SYSTEM_PROMPT_DEFAULT });
    expect(log.entries).toEqual([{ obj: expect.objectContaining({ fallback: true, reason: "no_active" }), msg: "prompt_fallback" }]);
    await client.close();
    await server.close();
  });

  it("DB 모듈을 열지 못해도 그 prompt 만 기본값으로 답하고 세션은 계속 쓸 수 있다 (#657 9-1)", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    server.tool("get_sleep", "x", async () => ({ content: [] }));
    const log = recordingLog();
    registerDomainKnowledgePrompt(server, async () => { throw new Error("import failed"); }, log);
    const client = await connect(server);
    const got = await client.getPrompt({ name: DOMAIN_KNOWLEDGE_PROMPT });
    expect(got.messages[0].content).toEqual({ type: "text", text: SYSTEM_PROMPT_DEFAULT });
    expect(log.entries[0].obj).toMatchObject({ reason: "db_unavailable", err: "import failed" });
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(["get_sleep"]);
    await client.close();
    await server.close();
  });
});

describe("server.ts 결선", () => {
  it("prompt 는 읽기 모드에서만 등록된다 — 전체 경로(앱 advisor)의 맥락은 그대로", () => {
    expect(SERVER_SRC.match(/registerDomainKnowledgePrompt\(/g)).toHaveLength(1);
    expect(SERVER_SRC).toMatch(/if \(mode === "read"\) registerDomainKnowledgePrompt\(server, /);
  });
});
