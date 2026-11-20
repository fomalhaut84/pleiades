// `local` 제공자의 stdio MCP 호스트 (#872 · 015 V-4a · §3-1 P-b · H-R1 · H-R4 · Q143).
// 제공자 1 = 호스트 프로세스 1(H-R1) — 리더 하나만 싣는다. CLI(질문) · prepare · probe 가 같은 실행 파일 · 같은 args 로 띄운다(H-R3 · V-4b).
// 줄 단위 JSON-RPC(MCP stdio). 기동 때는 아무것도 읽지 않는다 — `-p` CLI 는 stdio 서버가 늦으면 init 첫 줄을 늦춘다(#868 탐침 · 015 Q143 판정 블록).
// stdin 이 닫히면 끝난다(H-R4 — CLI 가 SIGKILL 돼도 고아로 남지 않는다).
import { emptyTally, mismatchOf } from "./fields";
import type { Reader, Registry } from "./readers";

/** 기동 상한 — 호스트를 띄워 initialize 응답을 받기까지(V-4b prepare 가 이것을 넘으면 그 제공자를 쓰지 않는다 · 탐침 p50 364~381 ms 의 여유) */
export const LOCAL_INIT_MAX_MS = 1000;
/** 한 줄 요청 상한 — 넘으면 그 입력을 버린다(호스트가 메모리를 쌓지 않게) */
export const REQUEST_MAX_BYTES = 1024 * 1024;
const PROTOCOL_FALLBACK = "2025-06-18";
/** 형식 불일치 · 읽기 실패 때 모델이 받는 고정 문구 — 원문 · 경로 · 오류 메시지를 싣지 않는다(012 BASE "확인하지 못했다") */
export const MISMATCH_TEXT = "형식 불일치 — 이 도구 결과를 확인하지 못했다.";
export const FAILED_TEXT = "읽기 실패 — 이 도구 결과를 확인하지 못했다.";

export interface HostIo {
  input: NodeJS.ReadableStream;
  write: (line: string) => void;
  /** 운영 중 보이는 길(원칙 3 ②) — 개수 · 코드만 */
  err: (line: string) => void;
  /** stdin 이 닫혔다 — 호출자가 프로세스를 끝낸다 */
  onEnd: () => void;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

const errCode = (e: unknown) => {
  const code = (e as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,20}$/.test(code) ? code : "THROW";
};

/** 도구 하나 — 실패 · 불일치는 결과 실패로(원칙 3 ①) + stderr 개수 줄(②) */
export function callTool(reader: Reader, dir: string, name: string, args: Json, err: (l: string) => void): Json {
  const tag = `[local-host] reader=${reader.id} tool=${name}`;
  try {
    const r = reader.call(name, args, dir);
    const t = r.tally ?? emptyTally();
    if (mismatchOf(t) > 0) {
      err(`${tag} mismatch unknown=${t.unknown} missing=${t.missing} broken=${t.broken}`);
      return { content: [{ type: "text", text: MISMATCH_TEXT }], isError: true };
    }
    return { content: [{ type: "text", text: r.text }] };
  } catch (e) {
    err(`${tag} error=${errCode(e)}`);
    return { content: [{ type: "text", text: FAILED_TEXT }], isError: true };
  }
}

/** 요청 하나 → 응답(알림이면 null) */
export function handle(reader: Reader, dir: string, req: Json, err: (l: string) => void): Json | null {
  const id = req.id;
  if (id === undefined || id === null) return null; // 알림(notifications/initialized 등)
  const ok = (result: Json) => ({ jsonrpc: "2.0", id, result });
  const bad = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  const params = isObj(req.params) ? req.params : {};
  switch (req.method) {
    case "initialize":
      return ok({
        protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_FALLBACK,
        capabilities: { tools: {} },
        serverInfo: { name: `pl-${reader.id}`, version: "1" },
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: reader.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string" || !reader.tools.some((t) => t.name === name)) return bad(-32602, "unknown tool");
      return ok(callTool(reader, dir, name, isObj(params.arguments) ? params.arguments : {}, err));
    }
    default:
      return bad(-32601, "method not found");
  }
}

/** 호스트 루프 — 리더가 레지스트리에 없으면 던진다(호출자가 rc 2) */
export function runHost(registry: Registry, readerId: string, dir: string, io: HostIo): void {
  const reader = registry.get(readerId);
  if (!reader) throw new Error("리더 없음");
  let buf = "";
  let dropping = false;
  const tooLarge = () => io.err(`[local-host] reader=${reader.id} request-too-large`);
  const line = (raw: string) => {
    const s = raw.trim();
    if (!s) return;
    let req: unknown;
    try {
      req = JSON.parse(s);
    } catch {
      io.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }));
      return;
    }
    if (!isObj(req)) return;
    const res = handle(reader, dir, req, io.err);
    if (res) io.write(JSON.stringify(res));
  };
  io.input.setEncoding("utf8");
  io.input.on("data", (c: string) => {
    buf += c;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const one = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (dropping) dropping = false; // 상한을 넘은 줄의 끝 — 다음 줄부터 다시 받는다
      else if (Buffer.byteLength(one, "utf8") > REQUEST_MAX_BYTES) tooLarge(); // 줄 끝과 한 청크로 온 큰 줄 — 해석하지 않는다
      else line(one);
    }
    if (!dropping && Buffer.byteLength(buf, "utf8") > REQUEST_MAX_BYTES) {
      buf = "";
      dropping = true; // 줄 끝이 올 때까지 버린다
      tooLarge();
    } else if (dropping) buf = "";
  });
  io.input.on("end", io.onEnd);
  io.input.on("close", io.onEnd);
}

export const HOST_USAGE = "사용: local-host --reader <id> --dir <위치>";

/** argv → { reader, dir } · 형식이 다르면 null */
export function parseHostArgs(argv: readonly string[]): { reader: string; dir: string } | null {
  if (argv.length !== 4 || argv[0] !== "--reader" || argv[2] !== "--dir") return null;
  const [, reader, , dir] = argv;
  if (!/^[a-z0-9_]{1,60}$/.test(reader) || !dir.startsWith("/")) return null;
  return { reader, dir };
}
