// #309 (M14 Phase 2 #5): 음식 사진 → Claude Vision 으로 kcal + macros 추정.
// 텍스트 estimator (estimate-nutrition.ts) 와 동일한 NutritionEstimate shape 반환.
// #461: 이미지는 stream-json 본문으로 넘긴다 — `@<path>` 는 큰 사진이 모델에 닿지 않았다(운영 3회 · 로컬 재현).
//
// 응답 검증은 parseNutritionResponse 재사용 (item 별 4·4·9, macros null propagate).

import { spawn } from "child_process";
import fs from "node:fs/promises";
import { parseNutritionResponse, type NutritionEstimate } from "./estimate-nutrition";
import { CLAUDE_CLI_ISOLATION_ARGS } from "@/lib/ai/cli-isolation";
import { buildImageInputLine, parseStreamResult } from "@/lib/ai/cli-image-input";
import { claudeModelId, claudeSpawnEnv, warnModelDrift } from "@/lib/ai/models";
import { sniffImageType } from "@/lib/checkup/import/image-type";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
// Vision 은 텍스트 estimator (18s) 보다 느림. 45s 여유 마진.
const DEFAULT_TIMEOUT_MS = 45_000;

export interface NutritionPhotoInput {
  /** 절대 경로 (temp 파일). 이 함수가 읽어 본문으로 넘긴다 — 경로는 CLI 에 전달하지 않는다. */
  imagePath: string;
  /** 사용자 부가 설명 (봇 캡션 or 웹 텍스트). Vision 에 컨텍스트로 전달. */
  caption?: string;
  /** breakfast · lunch · dinner · snack. Vision 이 양·구성 추정에 참고. */
  mealType?: string;
}

export interface EstimatePhotoOptions {
  timeoutMs?: number;
  spawnImpl?: typeof spawn;
}

const MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: "아침",
  lunch: "점심",
  dinner: "저녁",
  snack: "간식",
};

function buildPhotoPrompt(input: NutritionPhotoInput): string {
  const mealLine =
    input.mealType && MEAL_TYPE_LABEL[input.mealType]
      ? `식사 유형: ${MEAL_TYPE_LABEL[input.mealType]}\n`
      : "";
  const captionLine = input.caption?.trim()
    ? `사용자 캡션: ${input.caption.trim()}\n`
    : "";
  return [
    "위 이미지는 한국인이 촬영한 음식 사진입니다. 각 항목의 이름·양·kcal·매크로 (P/C/F g) 를 추정하세요.",
    "",
    "규칙:",
    "- 사진에서 식별되는 각 음식 항목을 items 배열로 분해.",
    "- 양 추정: 그릇 크기·plate 배치·젓가락 등 스케일 단서 활용. 불분명하면 표준 1인분 가정.",
    "- 한식 표준 1인분 (밥 1공기 300kcal · P6g · C66g · F1g / 김치찌개 1대접 350kcal · P22g · C15g · F20g 등).",
    "- 모르는 항목의 kcal/매크로는 해당 필드를 null 로.",
    "- 매크로 4·4·9 kcal/g 규칙에 근접 (P·4 + C·4 + F·9 ≈ 항목 kcal, ±25% 오차 허용).",
    "- 사진에서 항목 특정이 어려우면 confidence: low. 표준 한식으로 명확하면 med. 잘 알려진 표준품 (예: 스타벅스 톨 라떼) 이면 high.",
    "- 응답은 오직 JSON 하나만. 설명·마크다운·코드펜스 금지.",
    "",
    "응답 형식:",
    "{",
    '  "items": [',
    '    {"name": "김치찌개", "kcal": 350, "protein_g": 22, "carbs_g": 15, "fat_g": 20},',
    "    ...",
    "  ],",
    '  "total_kcal": <합계 정수>,',
    '  "total_protein_g": <합계 수치 or null>,',
    '  "total_carbs_g": <합계 수치 or null>,',
    '  "total_fat_g": <합계 수치 or null>,',
    '  "confidence": "low" | "med" | "high",',
    '  "notes": "가정한 양이나 참고 (선택)"',
    "}",
    "",
    captionLine + mealLine,
  ]
    .filter((s) => s !== "")
    .join("\n");
}

async function readPhoto(imagePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(imagePath);
  } catch (err) {
    console.warn(`[nutrition-photo] 사진 읽기 실패: ${(err as NodeJS.ErrnoException).code ?? (err instanceof Error ? err.name : typeof err)}`);
    return null;
  }
}

export async function estimateNutritionFromPhoto(
  input: NutritionPhotoInput,
  opts: EstimatePhotoOptions = {},
): Promise<NutritionEstimate | null> {
  if (!input.imagePath) return null;
  const bytes = await readPhoto(input.imagePath);
  if (!bytes) return null;
  // MIME · 확장자는 믿지 않는다 — 봇 경로는 첨부 content type 으로 정하고 웹은 클라이언트가 정한다
  const imageType = sniffImageType(bytes);
  if (!imageType) {
    console.warn("[nutrition-photo] 지원하지 않는 이미지 형식");
    return null;
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spawnFn = opts.spawnImpl ?? spawn;
  const inputLine = buildImageInputLine(bytes, imageType, buildPhotoPrompt(input));

  // Codex P1 (PR #310): `--tools "Read"` 는 caption/image 로 prompt-injection 되면 임의 서버
  // 파일 (예: .env) 을 읽어 items[].name / notes 에 실어 응답 가능 → API/봇이 그대로 노출.
  // `--tools ""` 로 tool 차단. 이미지는 stdin 본문으로 가므로 도구 없이 Vision 이 동작한다.
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

  return new Promise<NutritionEstimate | null>((resolve) => {
    const child = spawnFn(CLAUDE_BIN, args, {
      timeout: timeoutMs,
      cwd: process.cwd(),
      env: claudeSpawnEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    // CLI 가 먼저 죽으면 큰 본문 쓰기가 EPIPE 로 실패한다 — 처리하지 않으면 봇·웹 프로세스가 죽는다. 판정은 close 가 한다
    child.stdin.on("error", (err: Error) => {
      console.warn(`[nutrition-photo] stdin 쓰기 실패: ${err.message}`);
    });
    child.stdin.end(inputLine);
    const stdoutChunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdoutChunks.push(d);
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err: Error) => {
      console.warn(`[nutrition-photo] spawn 실패: ${err.message}`);
      resolve(null);
    });
    child.on("close", (code: number | null) => {
      const outer = parseStreamResult(Buffer.concat(stdoutChunks).toString("utf8"));
      // #255: 종료 코드·is_error 판정 전에 — 실패로 드러나는 모델 교체도 경고한다 (#258 Codex P2)
      warnModelDrift("nutrition-photo", outer, "sonnet");
      if (code !== 0) {
        console.warn(
          `[nutrition-photo] CLI exit code=${code}: ${stderr.slice(0, 200) || "(no stderr)"}`,
        );
        return resolve(null);
      }
      if (!outer) {
        console.warn("[nutrition-photo] CLI 출력에 result 줄 없음");
        return resolve(null);
      }
      if (outer.is_error) {
        console.warn(`[nutrition-photo] CLI is_error subtype=${outer.subtype ?? "?"}`);
        return resolve(null);
      }
      const text = outer.result ?? "";
      const parsed = parseNutritionResponse(text);
      if (!parsed) {
        console.warn(`[nutrition-photo] AI 응답 파싱/검증 실패: ${text.slice(0, 200)}`);
      }
      resolve(parsed);
    });
  });
}
