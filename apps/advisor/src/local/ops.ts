// ops 리더 — 수집기 요약 상태 · 요약 이벤트 (#880 · 015 V-5 · §7-1 O2).
// 읽는 곳: 통합 층 비공개 루트의 ops/(수집기 상태 디렉터리 · 서버 판정 S-2 — 같은 루트 · 같은 OS 사용자 S-1).
// 원문은 없다 — events 는 허용 목록 필드만 · state 의 지문은 material · detail · scope 를 내지 않는다(원문이 섞일 수 있는 자리 · V27).
// "무슨 오류였나" 의 내용은 답할 수 없다 — 그건 서버 로그 원문이고 이 리더 밖이다(015 §7-1 · 008 원칙).
import path from "node:path";
import { Field, Shape, Tally, emptyTally, fileIn, pick, pickLines, readCapped } from "./fields";
import SHAPES from "./ops-shape.json";
import type { Reader } from "./readers";

const FIELDS: ReadonlySet<string> = new Set(["string", "number", "boolean"]);

/** 허용 목록 JSON → Shape — 형이 아니면 모듈을 불러올 때 던진다(조용히 통과시키지 않는다) */
function asShape(x: { required: Record<string, string>; optional: Record<string, string>; ignored: string[] }): Shape {
  const check = (r: Record<string, string>) => {
    for (const v of Object.values(r)) if (!FIELDS.has(v)) throw new Error("ops-shape 형식");
    return r as Record<string, Field>;
  };
  return { required: check(x.required), optional: check(x.optional), ignored: [...x.ignored] };
}

export const EVENT_SHAPE = asShape(SHAPES.event);
export const STATE_SHAPE = asShape(SHAPES.state);
export const FP_SHAPE = asShape(SHAPES.fp);

/** 수집기 상한(collect.cjs maxStateBytes 1 MB)의 여유 · events 는 14일 보존(서버 실측 72 KB · S-3) */
export const STATE_MAX_BYTES = 2 * 1024 * 1024;
export const EVENTS_MAX_BYTES = 4 * 1024 * 1024;
/** 도구 결과 행 상한 — 넘으면 최신부터 자르고 truncated 를 알린다 */
export const EVENTS_MAX_ROWS = 200;
export const OPEN_MAX_ROWS = 50;
/** since_hours — 기본 하루 · 상한 = 보존 14일 */
export const SINCE_DEFAULT_H = 24;
export const SINCE_MAX_H = 14 * 24;
const APP = /^[a-z0-9_]{1,20}$/;

/** epoch ms → KST ISO(모델이 읽는 시각) */
export const kst = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().replace("Z", "+09:00");

type Rec = Record<string, string | number | boolean>;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** state.json — 마지막 실행 · 열린 이상(일일 요약과 같은 정의: kind state · open) */
function summary(dir: string): { text: string; tally: Tally } {
  const tally = emptyTally();
  let raw: unknown;
  try {
    raw = JSON.parse(readCapped(fileIn(dir, "state.json"), STATE_MAX_BYTES));
  } catch (e) {
    if (e instanceof SyntaxError) {
      tally.broken++;
      return { text: "", tally };
    }
    throw e;
  }
  const top = pick(raw, STATE_SHAPE, tally);
  const fpsRaw = isObj(raw) ? raw.fps : undefined;
  if (!isObj(fpsRaw)) tally.missing++;
  const fps = Object.values(isObj(fpsRaw) ? fpsRaw : {}).map((e) => pick(e, FP_SHAPE, tally)).filter((e): e is Rec => e !== null);
  const open = fps.filter((e) => e.kind === "state" && e.open === true).sort((a, b) => (b.last as number) - (a.last as number));
  const row = (e: Rec) => ({ fp: e.fp, app: e.app ?? null, role: e.role ?? null, src: e.src ?? null, sev: e.sev, first: kst(e.first as number), last: kst(e.last as number) });
  return {
    text: JSON.stringify({
      lastRunAt: typeof top?.lastRunAt === "number" ? kst(top.lastRunAt) : null,
      summaryDate: top?.summaryDate ?? null,
      openCount: open.length,
      open: open.slice(0, OPEN_MAX_ROWS).map(row),
      truncated: open.length > OPEN_MAX_ROWS,
    }),
    tally,
  };
}

function hoursOf(v: unknown): number {
  if (v === undefined) return SINCE_DEFAULT_H;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > SINCE_MAX_H) throw new Error("since_hours");
  return v;
}

/** events.jsonl — since_hours 안 · app 이 있으면 그 앱만 · 최신순 · 상한 */
function events(dir: string, args: Record<string, unknown>, now: number): { text: string; tally: Tally } {
  const hours = hoursOf(args.since_hours);
  if (args.app !== undefined && (typeof args.app !== "string" || !APP.test(args.app))) throw new Error("app");
  const tally = emptyTally();
  const since = now - hours * 3600_000;
  const rows = pickLines(readCapped(fileIn(dir, "events.jsonl"), EVENTS_MAX_BYTES), EVENT_SHAPE, tally)
    .filter((r) => (r.at as number) >= since && (args.app === undefined || r.app === args.app))
    .sort((a, b) => (b.at as number) - (a.at as number));
  return {
    text: JSON.stringify({
      since: kst(since),
      count: rows.length,
      rows: rows.slice(0, EVENTS_MAX_ROWS).map((r) => ({ ...r, at: kst(r.at as number) })),
      truncated: rows.length > EVENTS_MAX_ROWS,
    }),
    tally,
  };
}

export function makeOpsReader(now: () => number = Date.now): Reader {
  return {
    id: "ops",
    allowedDecl: "deploy/ops", // 015 Q144 — 이 선언 위치 하나만 이 리더를 고른다
    location: (root) => path.join(root, "ops"),
    tools: [
      {
        name: "ops_summary",
        description: "운영 수집기 요약 — 마지막 수집 시각 · 지금 열린 이상(지문 · 앱 · 역할 · 출처 · 심각도 · 처음/마지막 시각). 오류 원문은 없다.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "ops_events",
        description: `운영 요약 이벤트 — 최근 since_hours 시간(기본 ${SINCE_DEFAULT_H} · 최대 ${SINCE_MAX_H}) · app(fin · fit · adv · hrm · ops 등)으로 거른다 · 최신순 ${EVENTS_MAX_ROWS}행까지. 언제 · 어느 앱 · 역할 · 출처 코드 · 심각도 · 횟수만 있고 오류 원문은 없다.`,
        inputSchema: {
          type: "object",
          properties: {
            since_hours: { type: "integer", minimum: 1, maximum: SINCE_MAX_H },
            app: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    ],
    examples: { ops_summary: {}, ops_events: { since_hours: SINCE_MAX_H } },
    call(tool, args, dir) {
      if (tool === "ops_summary") return summary(dir);
      if (tool === "ops_events") return events(dir, args, now());
      throw new Error("tool");
    },
  };
}
