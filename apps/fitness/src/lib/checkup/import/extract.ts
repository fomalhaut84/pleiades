// #532: 결과지 이미지 1장 → Claude Vision → 검증된 쪽 결과.
// 도구 전부 차단 (`--tools ""`) — 업로드 이미지가 프롬프트 인젝션 경로다. Read 를 열면 경로를 제한해도 서버 파일을
// 읽을 수 있다 (2026-10-16 PoC · 음식 사진 #309 Codex P1 과 같은 위험). PDF 는 브라우저가 이미지로 바꿔 보낸다.
// #462: 이미지는 stream-json 본문으로 넘긴다 — `@경로` 는 큰 이미지가 모델에 닿지 않았다 (#461 과 같은 결함).
// 로그에는 실패 종류 · 길이만 — 응답 원문은 건강 데이터라 남기지 않는다.
import { spawn } from "child_process";
import { buildExtractPrompt } from "./extract-prompt";
import { parseExtractResponse, type ExtractedPage } from "./extract-schema";
import type { ImageType } from "./image-type";
import { buildImageInputLine, parseStreamResult } from "@/lib/ai/cli-image-input";
import { CLAUDE_CLI_ISOLATION_ARGS } from "@/lib/ai/cli-isolation";
import { claudeModelId, claudeSpawnEnv, warnModelDrift } from "@/lib/ai/models";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
/** Nginx proxy_read_timeout 60초 안 — 장당 실측 9~11초 */
export const EXTRACT_TIMEOUT_MS = 50_000;

export type ExtractFailure = "spawn" | "timeout" | "cli" | "parse";

export type ExtractResult = { ok: true; page: ExtractedPage } | { ok: false; reason: ExtractFailure };

export interface ExtractOptions {
  timeoutMs?: number;
  spawnImpl?: typeof spawn;
}

export interface ExtractImage {
  bytes: Uint8Array;
  type: ImageType;
}

export function extractCheckupPage(image: ExtractImage, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const spawnFn = opts.spawnImpl ?? spawn;
  const args = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    // stream-json 출력은 --verbose 를 요구한다
    "--verbose",
    "--model",
    // #255: 별칭이 아닌 고정 ID — CLI 업데이트로 모델이 조용히 바뀌지 않게
    claudeModelId("sonnet"),
    "--max-turns",
    "1",
    "--tools",
    "",
    // #563: claude.ai 커넥터 등 넘기지 않은 MCP 차단
    ...CLAUDE_CLI_ISOLATION_ARGS,
  ];

  return new Promise<ExtractResult>((resolve) => {
    const child = spawnFn(CLAUDE_BIN, args, {
      timeout: opts.timeoutMs ?? EXTRACT_TIMEOUT_MS,
      cwd: process.cwd(),
      env: claudeSpawnEnv(),
      // stderr 는 읽지 않는다 — 파이프로 열어 두면 버퍼가 차서 막힐 수 있다 · 원문을 메모리에 두지도 않는다
      stdio: ["pipe", "pipe", "ignore"],
    });
    // CLI 가 먼저 죽으면 큰 본문 쓰기가 EPIPE 로 실패한다 — 처리하지 않으면 웹 프로세스가 죽는다. 판정은 close 가 한다
    child.stdin?.on("error", (err: Error) => {
      console.warn(`[checkup-extract] stdin 쓰기 실패: ${err.message}`);
    });
    child.stdin?.end(buildImageInputLine(image.bytes, image.type, buildExtractPrompt()));
    const stdoutChunks: Buffer[] = [];
    child.stdout?.on("data", (d: Buffer) => {
      stdoutChunks.push(d);
    });
    child.on("error", (err: Error) => {
      console.warn(`[checkup-extract] spawn 실패: ${err.message}`);
      resolve({ ok: false, reason: "spawn" });
    });
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      // #255: 종료 코드·is_error 판정 전에 — 실패로 드러나는 모델 교체도 경고한다 (#258 Codex P2)
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const outer = parseStreamResult(stdout);
      warnModelDrift("checkup-extract", outer, "sonnet");
      if (signal === "SIGTERM") {
        console.warn("[checkup-extract] 시간 초과");
        return resolve({ ok: false, reason: "timeout" });
      }
      if (code !== 0) {
        console.warn(`[checkup-extract] CLI exit code=${code}`);
        return resolve({ ok: false, reason: "cli" });
      }
      if (!outer) {
        console.warn(`[checkup-extract] CLI 출력에 result 줄 없음 (length=${stdout.length})`);
        return resolve({ ok: false, reason: "cli" });
      }
      if (outer.is_error) {
        console.warn(`[checkup-extract] CLI is_error subtype=${outer.subtype ?? "?"}`);
        return resolve({ ok: false, reason: "cli" });
      }
      const page = parseExtractResponse(outer.result ?? "");
      if (!page) {
        console.warn(`[checkup-extract] 응답 검증 실패 (length=${(outer.result ?? "").length})`);
        return resolve({ ok: false, reason: "parse" });
      }
      resolve({ ok: true, page });
    });
  });
}
