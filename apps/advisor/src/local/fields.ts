// `local` 리더의 읽기 도우미 (#872 · 015 V-4a · §3-1 원칙 2 · 3).
// 리더는 이 파일의 함수로만 파일을 읽는다 — 정확한 파일 이름 · 크기 상한 · 필드 허용 목록 · 형식 불일치 개수.
// 쓰기 API 는 쓰지 않는다(쓰기 0 시험 ② 가 이 디렉터리 전체와 호스트 번들을 검사한다). 열기도 하지 않는다 — fd 가 없으면 fs.write 도 없다.
import fs from "node:fs";
import path from "node:path";

/** 형식 불일치 개수 — 원문은 세지 않고 남기지도 않는다(stderr 에는 이 숫자만 · 원칙 3) */
export interface Tally {
  /** 허용 목록에 없는 필드 — 버리고 센다 */
  unknown: number;
  /** 필수 필드가 없거나 형이 다르다 — 그 레코드를 버리고 센다 */
  missing: number;
  /** JSON 이 아닌 줄 · 객체가 아닌 레코드 — 건너뛰고 센다(append 중의 부분 줄 포함 · 015 V25) */
  broken: number;
}

export const emptyTally = (): Tally => ({ unknown: 0, missing: 0, broken: 0 });
export const mismatchOf = (t: Tally) => t.unknown + t.missing + t.broken;

/** 파일 이름 하나 — 경로 구분자 · `..` · 숨김 이름이 아니어야 한다(같은 디렉터리의 임시 파일 `x.<pid>.tmp` 같은 다른 이름은 리더가 상수로 고르지 않는다 · 015 §6-1 AU:18) */
const FILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,80}$/;

/** dir 안의 정확한 파일 이름 — 이름은 리더 코드의 상수다 */
export function fileIn(dir: string, name: string): string {
  if (!FILE_NAME.test(name) || name.includes("..")) throw new Error("파일 이름 형식");
  return path.join(dir, name);
}

/** 크기 상한을 넘으면 던진다(조용히 자르지 않는다). 읽는 동안 커져도 읽은 뒤 길이로 다시 본다 */
export function readCapped(file: string, maxBytes: number): string {
  const st = fs.statSync(file);
  if (!st.isFile()) throw new Error("파일이 아니다");
  if (st.size > maxBytes) throw new Error("크기 상한 초과");
  const buf = fs.readFileSync(file);
  if (buf.length > maxBytes) throw new Error("크기 상한 초과");
  return buf.toString("utf8");
}

export type Field = "string" | "number" | "boolean";
export interface Shape {
  /** 필수 필드와 형 */
  required: Readonly<Record<string, Field>>;
  /** 선택 필드와 형 — 형이 다르면 그 필드만 버리고 missing 으로 센다 · null 은 "없음"(쓰는 쪽이 `x || null` 로 적는다 · #880) */
  optional?: Readonly<Record<string, Field>>;
  /** 아는 필드지만 내보내지 않는다 — 세지도 복사하지도 않는다(원문이 섞일 수 있는 자리 · 내부 집계 · #880). 모르는 필드와 다르다 */
  ignored?: readonly string[];
}

type Rec = Record<string, string | number | boolean>;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isField = (v: unknown, f: Field) => (f === "number" ? typeof v === "number" && Number.isFinite(v) : typeof v === f);

/** 허용 목록으로 거른 새 객체 — 필수가 빠지면 null(missing 1) · 모르는 필드는 버리고 센다 */
export function pick(v: unknown, shape: Shape, tally: Tally): Rec | null {
  if (!isObj(v)) {
    tally.broken++;
    return null;
  }
  const optional = shape.optional ?? {};
  const out: Rec = {};
  for (const [k, f] of Object.entries(shape.required)) {
    if (!isField(v[k], f)) {
      tally.missing++;
      return null;
    }
    out[k] = v[k] as string | number | boolean;
  }
  for (const [k, f] of Object.entries(optional)) {
    if (v[k] === undefined || v[k] === null) continue;
    if (isField(v[k], f)) out[k] = v[k] as string | number | boolean;
    else tally.missing++;
  }
  const ignored = shape.ignored ?? [];
  for (const k of Object.keys(v)) {
    if (!Object.hasOwn(shape.required, k) && !Object.hasOwn(optional, k) && !ignored.includes(k)) tally.unknown++; // 프로토타입 이름(__proto__ 등)도 센다(#872 9-1 I3)
  }
  return out;
}

/** JSON 줄 파일 — 빈 줄은 건너뛰고 깨진 줄은 세며 건너뛴다 */
export function pickLines(text: string, shape: Shape, tally: Tally): Rec[] {
  const out: Rec[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      tally.broken++;
      continue;
    }
    const r = pick(v, shape, tally);
    if (r) out.push(r);
  }
  return out;
}

/** JSON 파일 하나 — 깨졌으면 broken 1 · null */
export function pickJson(text: string, shape: Shape, tally: Tally): Rec | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    tally.broken++;
    return null;
  }
  return pick(v, shape, tally);
}
