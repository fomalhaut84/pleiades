// #461: 이미지를 Claude CLI 에 stream-json 본문으로 넘기는 입출력 형식. 순수.
// `@경로` 는 큰 이미지가 모델에 닿지 않는다(JPEG 1.6 MB · CLI 2.1.308·2.1.318 재현). 본문 전달은 9.6 MB 까지 실측 통과.

import type { ImageType } from "@/lib/checkup/import/image-type";

const MEDIA_TYPE: Record<ImageType, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** `--input-format stream-json` 의 stdin 한 줄(끝에 줄바꿈 포함) — 이미지 블록 뒤에 텍스트 블록. */
export function buildImageInputLine(bytes: Uint8Array, type: ImageType, text: string): string {
  const message = {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: MEDIA_TYPE[type],
            data: Buffer.from(bytes).toString("base64"),
          },
        },
        { type: "text", text },
      ],
    },
  };
  return `${JSON.stringify(message)}\n`;
}

export interface CliStreamResult {
  type: "result";
  result?: string;
  is_error?: boolean;
  subtype?: string;
  modelUsage?: unknown;
}

/** `--output-format stream-json` 출력에서 마지막 result 줄. 없으면 null — JSON 이 아닌 줄은 건너뛴다. */
export function parseStreamResult(stdout: string): CliStreamResult | null {
  const results = stdout.split("\n").flatMap((line): CliStreamResult[] => {
    if (line.trim() === "") return [];
    try {
      const parsed: unknown = JSON.parse(line);
      return isResultLine(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  });
  return results.at(-1) ?? null;
}

function isResultLine(value: unknown): value is CliStreamResult {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "result";
}
