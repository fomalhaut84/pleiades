// 통합 층 하루 상한 [D2] $5.00 (#686 · 012 U2 · 사용자 결정: 비공개 파일).
// KST 날짜별 파일 `<advisor 비공개>/spend-YYYY-MM-DD.json`(600) — 재기동(배포·크래시)해도 같은 날 사용액이 남는다.
// 쓰기는 임시 600 → rename(덮어쓰기 · 쓰는 프로세스는 통합 층 하나 · 012 §5-1 과 같은 방식). 초기화 = 파일 삭제(**즉시**).
// 닫힌 쪽: 파일을 읽을 수 없거나 형식이 깨졌거나, **이 프로세스가 그날 쓰기에 실패했으면** 상한에 닿은 것으로 본다
// (쓰기만 실패하면 읽기는 옛 값을 돌려줘 상한이 꺼진다 — #686 9-1 major 1 · 디스크 가득 전례 #391).
import fs from "node:fs";
import path from "node:path";

export const DAILY_CAP_USD = 5.0;
const KST_MS = 9 * 3600_000;

export const kstDate = (ms: number) => new Date(ms + KST_MS).toISOString().slice(0, 10);

export interface SpendState {
  date: string;
  usd: number;
  /** 판정할 수 없다(읽기·형식·쓰기 실패) — 상한으로 본다 */
  broken: boolean;
}

export class DailySpend {
  private readonly writeFailed = new Set<string>();

  constructor(
    private readonly dir: string,
    private readonly now: () => number = Date.now,
    readonly cap: number = DAILY_CAP_USD,
  ) {}

  private file(date: string) {
    return path.join(this.dir, `spend-${date}.json`);
  }

  /** 오늘(KST) — date 를 주면 그날 */
  read(date: string = kstDate(this.now())): SpendState {
    if (this.writeFailed.has(date)) return { date, usd: 0, broken: true };
    let text: string;
    try {
      text = fs.readFileSync(this.file(date), "utf8");
    } catch (e) {
      return { date, usd: 0, broken: (e as NodeJS.ErrnoException).code !== "ENOENT" };
    }
    try {
      const j = JSON.parse(text) as { date?: unknown; usd?: unknown };
      if (j.date === date && typeof j.usd === "number" && Number.isFinite(j.usd) && j.usd >= 0) return { date, usd: j.usd, broken: false };
    } catch {
      // 아래
    }
    return { date, usd: 0, broken: true };
  }

  reached(): boolean {
    const s = this.read();
    return s.broken || s.usd >= this.cap;
  }

  /**
   * 그날(기본 오늘) 사용액을 더하고 새 상태를 돌려준다. 질문 전에 읽은 날짜를 넘기면 KST 자정을 넘긴 질문도 시작한 날로 센다(9-1 info 1).
   * 깨진 파일은 덮어쓰지 않는다(사람이 볼 수 있게). 쓰기에 실패하면 던지지 않고 그날을 broken 으로 둔다.
   */
  add(usd: number, date: string = kstDate(this.now())): SpendState {
    const s = this.read(date);
    if (s.broken || !(usd > 0)) return s;
    return this.write(s, s.usd + usd);
  }

  /**
   * 질문 **전**에 호출당 상한을 그날 사용액에 더한다(012 4b-3a2 #695 B7) — 강제 종료·크래시로 정산하지 못해도 상한 쪽으로 남는다.
   * 쓰기에 실패하면 broken — 호출부는 질문을 시작하지 않는다. 형식은 그대로 { date, usd }(4b-2 판으로 되돌려도 읽힌다).
   */
  reserve(usd: number, date: string = kstDate(this.now())): SpendState {
    return this.add(usd, date);
  }

  /** 예약을 실제 비용으로 고친다 — 차분(실제 − 예약) 1회 · 음수 허용 · 0 아래로는 내려가지 않는다. 0 이면 쓰지 않는다. */
  settle(delta: number, date: string = kstDate(this.now())): SpendState {
    const s = this.read(date);
    if (s.broken || !Number.isFinite(delta) || delta === 0) return s;
    return this.write(s, Math.max(0, s.usd + delta));
  }

  private write(s: SpendState, usd: number): SpendState {
    const { date } = s;
    const next = { date, usd: Math.round(usd * 10_000) / 10_000 };
    const tmp = `${this.file(date)}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
      fs.chmodSync(tmp, 0o600); // 크래시로 남은 .tmp 는 mode 가 적용되지 않는다(9-1 info 2)
      fs.renameSync(tmp, this.file(date));
    } catch {
      this.writeFailed.add(date);
      return { date, usd: s.usd, broken: true };
    }
    return { ...next, broken: false };
  }
}
