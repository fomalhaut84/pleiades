/**
 * 대기열 — SQLite outbox(014 §3-C C3 · D10 `node:sqlite` · H-1a #791).
 *
 * 받기는 한 트랜잭션에 행을 넣고 커밋한 뒤 `202` 로 답한다 — 그 뒤 유실 책임은 hermes 다(커밋 전 크래시만 잃는다 ·
 * WAL + synchronous FULL). 게시 루프(H-1b)는 하나뿐이라 꺼낸 행을 잠그지 않는다(`nextDue` 는 상태를 바꾸지 않는다).
 * 교체 자리: 이 인터페이스 뒤에서 C4 · C5 로 갈아 끼운다(§9).
 */
import { randomUUID } from "node:crypto";
import { chmodSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export type Level = "info" | "warn";
export type Status = "queued" | "sent" | "dead" | "blocked";

export interface Link {
  readonly label: string;
  readonly url: string;
}

export interface NewMessage {
  readonly source: string;
  readonly idempotencyKey?: string;
  readonly title?: string;
  readonly text: string;
  readonly link?: Link;
  readonly level: Level;
}

export interface QueuedMessage extends NewMessage {
  readonly id: string;
  readonly attempts: number;
  readonly receivedAt: number;
}

export type Counts = Readonly<Record<Status, number>>;

/** 상태 파일 재료(§3-G) — 수치 · 시각만 */
export interface QueueStats {
  readonly queued: number;
  readonly oldestQueuedAt: number | null;
  readonly dead: number;
  readonly deadSince: number;
  readonly blockedSince: number;
  readonly lastSentAt: number | null;
}

export interface Queue {
  enqueue(m: NewMessage, now: number): { id: string; duplicate: boolean };
  /** 다음에 보낼 행(받은 순서 · 다음 시도 시각이 지난 것) — 상태는 그대로 */
  nextDue(now: number): QueuedMessage | null;
  /** 가장 오래된 queued 행과 그 다음 시도 시각 — 게시 루프는 이것만 본다(받은 순서 · 재기동해도 대기 시각이 디스크에 있다 · #795 Codex P2) */
  head(): { message: QueuedMessage; nextAt: number } | null;
  markSent(id: string, now: number): void;
  /** 시도 수 +1 · 다음 시도 시각 */
  markRetry(id: string, nextAt: number): void;
  markDead(id: string, reason: string, now: number): void;
  markBlocked(id: string, reason: string, now: number): void;
  /** 끝난 행(sent · dead · blocked)을 보존 기간 뒤 지운다 — 지운 수 */
  purge(now: number): number;
  counts(): Counts;
  /** since 이후 끝난 dead · blocked 수 · 누적 dead · 적체 · 마지막 성공 */
  stats(since: number): QueueStats;
  journalMode(): string;
  close(): void;
}

export interface QueueOptions {
  /** (출처, Idempotency-Key) 중복 창 — 기본 7일(§3-C) */
  readonly idempotencyWindowMs?: number;
  /** 끝난 행 보존 — 기본 30일(§3-C · §3-I 본문을 오래 두지 않는다) */
  readonly retentionMs?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  idem_key    TEXT,
  title       TEXT,
  text        TEXT NOT NULL,
  link_label  TEXT,
  link_url    TEXT,
  level       TEXT NOT NULL CHECK (level IN ('info', 'warn')),
  status      TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'dead', 'blocked')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  received_at INTEGER NOT NULL,
  next_at     INTEGER NOT NULL,
  done_at     INTEGER,
  reason      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS messages_idem ON messages (source, idem_key) WHERE idem_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_due ON messages (status, next_at, received_at);
`;

interface Row {
  id: string;
  source: string;
  idem_key: string | null;
  title: string | null;
  text: string;
  link_label: string | null;
  link_url: string | null;
  level: Level;
  attempts: number;
  received_at: number;
}

function toMessage(r: Row): QueuedMessage {
  return {
    id: r.id,
    source: r.source,
    ...(r.idem_key !== null ? { idempotencyKey: r.idem_key } : {}),
    ...(r.title !== null ? { title: r.title } : {}),
    text: r.text,
    ...(r.link_label !== null && r.link_url !== null ? { link: { label: r.link_label, url: r.link_url } } : {}),
    level: r.level,
    attempts: r.attempts,
    receivedAt: r.received_at,
  };
}

export function openQueue(file: string, opts: QueueOptions = {}): Queue {
  const windowMs = opts.idempotencyWindowMs ?? 7 * DAY_MS;
  const retentionMs = opts.retentionMs ?? 30 * DAY_MS;
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;");
  // WAL 이 안 되는 파일 시스템이면 조용히 다른 모드로 돈다 — 멈춘다(9-1 info)
  const mode = String((db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode);
  if (mode !== "wal") {
    db.close();
    throw new Error(`hermes 대기열: WAL 모드가 아니다(${mode})`);
  }
  // 본문이 담기는 파일 — 상태 디렉터리 권한과 따로 0600(§3-I · 9-1 info) · 메모리 DB 는 건너뛴다
  if (file !== ":memory:") chmodSync(file, 0o600);
  db.exec(SCHEMA);

  const findIdem = db.prepare("SELECT id, received_at FROM messages WHERE source = ? AND idem_key = ?");
  const clearIdem = db.prepare("UPDATE messages SET idem_key = NULL WHERE id = ?");
  const insert = db.prepare(
    `INSERT INTO messages (id, source, idem_key, title, text, link_label, link_url, level, status, received_at, next_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
  );
  const due = db.prepare(
    `SELECT id, source, idem_key, title, text, link_label, link_url, level, attempts, received_at FROM messages
     WHERE status = 'queued' AND next_at <= ? ORDER BY received_at, rowid LIMIT 1`,
  );
  const headStmt = db.prepare(
    `SELECT id, source, idem_key, title, text, link_label, link_url, level, attempts, received_at, next_at FROM messages
     WHERE status = 'queued' ORDER BY received_at, rowid LIMIT 1`,
  );
  const finish = db.prepare(
    "UPDATE messages SET status = ?, attempts = attempts + 1, done_at = ?, reason = ? WHERE id = ? AND status = 'queued'",
  );
  const retry = db.prepare(
    "UPDATE messages SET attempts = attempts + 1, next_at = ? WHERE id = ? AND status = 'queued'",
  );
  const purgeStmt = db.prepare("DELETE FROM messages WHERE status != 'queued' AND done_at <= ?");
  const countStmt = db.prepare("SELECT status, COUNT(*) AS n FROM messages GROUP BY status");
  const statsStmt = db.prepare(
    `SELECT
       SUM(status = 'queued') AS queued,
       MIN(CASE WHEN status = 'queued' THEN received_at END) AS oldest,
       SUM(status = 'dead') AS dead,
       SUM(status = 'dead' AND done_at >= ?) AS dead_since,
       SUM(status = 'blocked' AND done_at >= ?) AS blocked_since,
       MAX(CASE WHEN status = 'sent' THEN done_at END) AS last_sent
     FROM messages`,
  );

  /** 한 트랜잭션 — 실패하면 되돌리고 던진다(받기 쪽이 503) */
  const tx = <T>(fn: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      db.exec("COMMIT");
      return out;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };

  return {
    enqueue(m, now) {
      return tx(() => {
        const key = m.idempotencyKey ?? null;
        if (key !== null) {
          const prev = findIdem.get(m.source, key) as { id: string; received_at: number } | undefined;
          if (prev !== undefined) {
            if (prev.received_at > now - windowMs) return { id: prev.id, duplicate: true };
            clearIdem.run(prev.id); // 창이 지난 옛 행 — 키를 비우고 새 메시지로 받는다
          }
        }
        const id = randomUUID();
        insert.run(
          id,
          m.source,
          key,
          m.title ?? null,
          m.text,
          m.link?.label ?? null,
          m.link?.url ?? null,
          m.level,
          now,
          now,
        );
        return { id, duplicate: false };
      });
    },
    nextDue(now) {
      const r = due.get(now) as Row | undefined;
      return r === undefined ? null : toMessage(r);
    },
    head() {
      const r = headStmt.get() as (Row & { next_at: number }) | undefined;
      return r === undefined ? null : { message: toMessage(r), nextAt: Number(r.next_at) };
    },
    markSent(id, now) {
      finish.run("sent", now, null, id);
    },
    markRetry(id, nextAt) {
      retry.run(nextAt, id);
    },
    markDead(id, reason, now) {
      finish.run("dead", now, reason, id);
    },
    markBlocked(id, reason, now) {
      finish.run("blocked", now, reason, id);
    },
    purge(now) {
      return Number(purgeStmt.run(now - retentionMs).changes);
    },
    counts() {
      const out: Record<Status, number> = { queued: 0, sent: 0, dead: 0, blocked: 0 };
      for (const r of countStmt.all() as { status: Status; n: number }[]) out[r.status] = Number(r.n);
      return out;
    },
    stats(since) {
      const r = statsStmt.get(since, since) as Record<string, number | null>;
      const n = (v: number | null) => Number(v ?? 0);
      const t = (v: number | null) => (v === null ? null : Number(v));
      return {
        queued: n(r.queued),
        oldestQueuedAt: t(r.oldest),
        dead: n(r.dead),
        deadSince: n(r.dead_since),
        blockedSince: n(r.blocked_since),
        lastSentAt: t(r.last_sent),
      };
    },
    journalMode() {
      return String((db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode);
    },
    close() {
      if (db.isOpen) db.close();
    },
  };
}
