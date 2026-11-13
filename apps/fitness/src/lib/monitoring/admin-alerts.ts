// #253/#256: 실패 카테고리 분류 + 관리자 rate-limited alert + 사용자용 short 문구.
//
// v2.16.1 (#253) 은 Claude 인증만 대상. #256 로 Garmin 재인증 실패 + MCP transport 다운 확장.
//
// 2026-07-21 사고 배경: Claude 인증 만료가 자동 감지 없이 사용자 UX 저하로만 확인. 재발 방지.

import type { BotProcess } from "@/bot/notifications/notifier";
import prisma from "@/lib/prisma";
import { sanitizeError } from "@/bot/utils/error";
import { Route, html } from "@pleiades/notify";
import { BOT_NOTIFY_CTX, notifierFor } from "@/bot/notifications/notifier";
import { OmronAuthError } from "@/lib/omron/client";
import { ASK_ADVISOR_DEFAULT_MAX_BUDGET_USD } from "@/lib/ai/advisor-budget";

// ─── 카테고리 정의 ─────────────────────────────────────────────────────────

/** 실패 카테고리. classify* 함수들이 반환. */
export type FailureCategory =
  | "claude_auth_expired"
  | "claude_rate_limit"
  | "claude_budget_exceeded"
  | "mcp_transport_down"
  | "garmin_auth_failed"
  | "omron_auth_failed"
  | "tool_missing"
  | "network"
  | "unknown";

/** SystemAlertState.alertType 값 (rate-limit 독립 관리). */
const ALERT_TYPE: Partial<Record<FailureCategory, string>> = {
  claude_auth_expired: "claude_auth_expired",
  claude_budget_exceeded: "claude_budget_exceeded",
  mcp_transport_down: "mcp_transport_down",
  garmin_auth_failed: "garmin_auth_failed",
  omron_auth_failed: "omron_auth_failed",
};

const RATE_LIMIT_MS = 60 * 60 * 1000; // 1시간

/**
 * #673: 관리자 알림 결과 — 사용자 문구가 실제 결과만 말하게 한다.
 * - sent: 이번에 보냈다 · recent: 1시간 안의 예약이 있어 생략(이미 보냈거나 동시 발송 진행 중 · P2002) · skipped: 봇 없음(웹)
 * - failed: DB 오류 · 발송 실패/예외 · pending: 기다림 상한(ADMIN_ALERT_WAIT_MS) 안에 끝나지 않음 · none: 알림 대상 분류 아님
 */
export type AlertOutcome = "sent" | "recent" | "skipped" | "failed" | "pending" | "none";

/** Prisma 고유 제약 위반(P2002) — 클래스 대신 code 로 본다(생성 클라이언트 경로에 묶이지 않게). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/** dispatcher 가 결과를 기다리는 상한 — 넘으면 pending 으로 돌려주고 발송은 뒤에서 계속된다(사용자 답장을 막지 않는다). */
export const ADMIN_ALERT_WAIT_MS = 3_000;

// ─── 패턴 매칭 ──────────────────────────────────────────────────────────────

const CLAUDE_AUTH_PATTERNS = [
  /authentication/i,
  /authenticate/i,
  /not\s+logged\s+in/i,
  /please\s+log\s*in/i,
  /please\s+run.*login/i,
  /invalid\s+api\s+key/i,
  /unauthorized/i,
  /api_status=401/i,
  /api_error_status\s*[:=]\s*401/i,
];
const CLAUDE_RATE_LIMIT_PATTERNS = [
  /rate\s*limit/i,
  /too\s+many\s+requests/i,
  /api_status=429/i,
  /api_error_status\s*[:=]\s*429/i,
  /quota/i,
];
// #666: askAdvisor 비용 상한(#665) — CLI 가 상한에서 끝낸 경우(subtype) + 재시도 루프가 남은 잔액 0 에서 멈춘 경우.
const CLAUDE_BUDGET_PATTERNS = [
  /subtype=error_max_budget_usd/,
  /askAdvisor: 예산 상한 도달/,
];
const TOOL_MISSING_PATTERNS = [
  /tool\s+호출\s+부족/, // askAdvisor turns=1 minTurns=2 실패 (#244)
  /minTurns/,
];
// MCP transport 다운: 클로드 CLI 가 로컬 127.0.0.1:4301 (또는 MCP_PORT) 에 접속 실패.
const MCP_TRANSPORT_PATTERNS = [
  /ECONNREFUSED.*(?:127\.0\.0\.1|localhost).*:\d{2,5}/i,
  /connect\s+ECONNREFUSED\s+127\.0\.0\.1/i,
  /MCP.*(?:transport|connection).*(?:refused|error|failed|not\s+ready)/i,
  /Cannot\s+connect\s+to\s+MCP/i,
  /mcp__myfitness__.*(?:refused|unreachable)/i,
];
const NETWORK_PATTERNS = [
  /ETIMEDOUT/,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /ENOTFOUND/,
  /getaddrinfo/i,
  /network/i,
];
// Garmin 재인증 실패: withReauth 이 재시도 후에도 401/403, 또는 login 자체 실패.
// isGarminAuthError 는 Garmin context 에서만 호출 → bare 상태 문구 + 라이브러리 문구 포함.
//
// @flow-js/garmin-connect 실제 throw 문구 (node_modules/.../HttpClient.js:339, :367):
//   "login failed (Ticket not found or MFA), please check username and password"
//   "login failed (AccountLocked)..."
// → 'garmin' 문자열 없음 → 명시 패턴 추가 (Codex bot PR #257 재리뷰 P2).
const GARMIN_AUTH_PATTERNS = [
  // Legacy 문구
  /Invalid\s+credentials/i,
  /Account\s+locked/i,
  /GARMIN_EMAIL\s+and\s+GARMIN_PASSWORD/i,
  /garmin.*login.*fail/i,
  /garmin.*(?:401|403|unauthorized)/i,
  // bare 상태 코드 / 상태 문구
  /\bunauthorized\b/i,
  /\bforbidden\b/i,
  /status\s*(?:code)?\s*[:=]?\s*40[13]\b/i,
  /\b40[13]\b\s*(?:unauthorized|forbidden)/i,
  /Request\s+failed\s+with\s+status\s+code\s+40[13]/i,
  // @flow-js/garmin-connect 실 문구
  /login\s+failed/i,
  /Ticket\s+not\s+found/i,
  /\bMFA\b/,
  /AccountLocked/i,
  /check\s+username\s+and\s+password/i,
];

function anyMatch(msg: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(msg));
}

/**
 * Claude CLI + MCP transport 실패를 분류. dedicated (Garmin) 은 별도 helper 로.
 * 매칭 우선순위: 비용 상한 → MCP transport → Claude auth → Claude rate-limit → tool_missing → network.
 * 비용 상한은 CLI 가 스스로 적은 subtype 이라 확정적이다 — 뒤에 붙는 stderr 의 다른 패턴보다 앞선다(#666).
 */
export function classifyClaudeError(err: unknown): FailureCategory {
  const msg = err instanceof Error ? err.message : String(err);
  if (anyMatch(msg, CLAUDE_BUDGET_PATTERNS)) return "claude_budget_exceeded";
  // MCP 를 그다음 (auth 패턴이 ECONNREFUSED 아래 있어 오분류 방지).
  if (anyMatch(msg, MCP_TRANSPORT_PATTERNS)) return "mcp_transport_down";
  if (anyMatch(msg, CLAUDE_AUTH_PATTERNS)) return "claude_auth_expired";
  if (anyMatch(msg, CLAUDE_RATE_LIMIT_PATTERNS)) return "claude_rate_limit";
  if (anyMatch(msg, TOOL_MISSING_PATTERNS)) return "tool_missing";
  if (anyMatch(msg, NETWORK_PATTERNS)) return "network";
  return "unknown";
}

/**
 * Garmin 관련 실패 여부. syncAll 상위 catch 에서 사용.
 * error 객체에 `status` (401/403) 가 있으면 문자열 매칭 없이도 인정 — withReauth 가
 * 재시도 후 원 에러를 그대로 throw 하는 케이스 (Codex bot PR #257 P2).
 */
export function isGarminAuthError(err: unknown): boolean {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (status === 401 || status === 403) return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return anyMatch(msg, GARMIN_AUTH_PATTERNS);
}

// ─── 사용자용 문구 ─────────────────────────────────────────────────────────

export interface FriendlyErrorOptions {
  /**
   * 관리자 알림 결과(`notifyAdminIfKnownFailure` 반환값). 없으면 none — 알림을 말하지 않는다.
   * 웹 route 는 봇 표지가 없어 보내지 않으므로 넘기지 않는다(#666). 1시간 rate-limit 생략은 recent(#673).
   */
  adminAlert?: AlertOutcome;
}

/** 알림 결과 → 문구 조각. 보냈을 때만 "전송됨" — 그 밖에는 사실과 다른 안내를 하지 않는다(#673). */
function adminAlertNote(outcome: AlertOutcome): string {
  if (outcome === "sent") return " 관리자에게 알림 전송됨.";
  if (outcome === "recent") return " 관리자 알림은 1시간 안에 이미 나갔거나 진행 중입니다.";
  return "";
}

/** 카테고리 → 사용자 노출 문구. 원본 error message 는 서버 로그로만. */
export function formatUserFriendlyError(err: unknown, options: FriendlyErrorOptions = {}): string {
  const category = classifyClaudeError(err);
  const alerted = adminAlertNote(options.adminAlert ?? "none");
  switch (category) {
    case "claude_budget_exceeded":
      return `💸 이번 AI 요청이 호출당 비용 상한에 닿아 중단됐습니다.${alerted} 질문을 좁혀 다시 시도해 주세요.`;
    case "claude_auth_expired":
      return `⚠️ AI 서비스 인증이 만료됐습니다.${alerted} 잠시 후 재시도해 주세요.`;
    case "claude_rate_limit":
      return "⏰ AI 요청량이 한도에 도달했습니다. 잠시 후 재시도해 주세요.";
    case "mcp_transport_down":
      return `🔧 데이터 도구 연결이 끊겼어요.${alerted} 잠시 후 재시도해 주세요.`;
    case "tool_missing":
      return "🔧 AI 가 데이터를 못 불러왔어요. 잠시 후 재시도해 주세요.";
    case "network":
      return "🌐 네트워크 문제로 AI 응답이 실패했습니다. 잠시 후 재시도해 주세요.";
    default:
      return "❌ AI 요청 처리 중 오류가 발생했습니다. 서버 로그 확인 필요.";
  }
}

// ─── Rate-limited alert 코어 로직 ──────────────────────────────────────────

/** KST 로컬 시각 표기 (알림 본문). */
function nowKstDisplay(): string {
  return new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface AlertOptions {
  alertType: string;
  buildMessage: (errSnippet: string, kst: string) => string;
  logPrefix: string;
}

/**
 * 카테고리별 wrapper 가 공유하는 rate-limit + 예약 + 발송 + 실패 시 해제 코어.
 *
 * 규칙:
 *   1) bot 없음 (webapp) → alert skip, rate-limit 예약 안 함 (다음 발생 시 로그만)
 *   2) atomic reserve (updateMany WHERE lastAlertAt < now-1h + INSERT fallback)
 *   3) 예약 성공 → 알림 발송
 *   4) sent=0 or 예외 → conditional deleteMany 로 예약 해제 (next 실패 시 즉시 재시도)
 */
async function notifyRateLimitedAlert(
  bot: BotProcess | undefined,
  err: unknown,
  opts: AlertOptions,
): Promise<AlertOutcome> {
  const errMsg = err instanceof Error ? err.message : String(err);
  const errSnippet = errMsg.slice(0, 200);

  if (!bot) {
    console.warn(
      `${opts.logPrefix} 감지 (bot 없음, alert skip): ${errSnippet}`,
    );
    return "skipped";
  }

  const now = new Date();
  try {
    const cutoff = new Date(now.getTime() - RATE_LIMIT_MS);
    const updated = await prisma.systemAlertState.updateMany({
      where: {
        alertType: opts.alertType,
        lastAlertAt: { lt: cutoff },
      },
      data: { lastAlertAt: now, lastErrorMsg: errSnippet },
    });
    if (updated.count === 0) {
      try {
        await prisma.systemAlertState.create({
          data: {
            alertType: opts.alertType,
            lastAlertAt: now,
            lastErrorMsg: errSnippet,
          },
        });
      } catch (createErr) {
        // #673 9-1 major: 고유 제약 위반(P2002 = 1시간 안의 row 가 있다)만 rate-limited 로 본다.
        // 그 row 는 이미 보냈거나 동시 예약이 진행 중이라는 뜻이다(구별 불가 — 문구도 그렇게 말한다). 다른 DB 오류는 failed.
        if (!isUniqueViolation(createErr)) {
          console.error(`${opts.logPrefix} 예약 생성 실패: ${sanitizeError(createErr)}`);
          return "failed";
        }
        console.warn(`${opts.logPrefix} 감지 (rate-limited): ${errSnippet}`);
        return "recent";
      }
    }

    const message = opts.buildMessage(errSnippet, nowKstDisplay());
    let delivered = false;
    try {
      const r = await notifierFor().notify(Route.ALLOWED, html(message), BOT_NOTIFY_CTX);
      delivered = r.sent > 0;
      if (delivered) {
        console.warn(`${opts.logPrefix} — admin alert 발송 (${errSnippet})`);
      } else {
        console.warn(
          `${opts.logPrefix} admin alert 전송 실패 (sent=0/total=${r.total}) — 예약 해제 후 재시도 유예`,
        );
      }
    } catch (sendErr) {
      console.error(
        `${opts.logPrefix} admin alert 전송 예외: ${sanitizeError(sendErr)} — 예약 해제`,
      );
    }
    if (!delivered) {
      try {
        await prisma.systemAlertState.deleteMany({
          where: { alertType: opts.alertType, lastAlertAt: now },
        });
      } catch (rollbackErr) {
        console.error(
          `${opts.logPrefix} 예약 해제 실패: ${sanitizeError(rollbackErr)}`,
        );
      }
    }
    return delivered ? "sent" : "failed";
  } catch (dbErr) {
    console.error(
      `${opts.logPrefix} rate-limit 상태 조회/저장 실패: ${sanitizeError(dbErr)}`,
    );
    return "failed";
  }
}

// ─── 카테고리별 wrapper ─────────────────────────────────────────────────────

export async function notifyClaudeAuthExpiredIfNeeded(
  bot: BotProcess | undefined,
  err: unknown,
): Promise<AlertOutcome> {
  if (classifyClaudeError(err) !== "claude_auth_expired") return "none";
  return notifyRateLimitedAlert(bot, err, {
    alertType: ALERT_TYPE.claude_auth_expired!,
    logPrefix: "[claude-auth] EXPIRED",
    buildMessage: (errSnippet, kst) =>
      [
        `⚠️ <b>Claude 인증 만료 감지</b>`,
        `시각: ${kst} (KST)`,
        "",
        `서버에서 아래 명령 실행 필요:`,
        `<code>claude login</code>`,
        "",
        `<b>에러</b>: ${errSnippet}`,
      ].join("\n"),
  });
}

/** #666: 호출당 비용 상한 도달 — 한 번은 큰 질문일 수 있지만 반복되면 프롬프트·도구 호출 폭주 신호다 */
export async function notifyClaudeBudgetExceededIfNeeded(
  bot: BotProcess | undefined,
  err: unknown,
): Promise<AlertOutcome> {
  if (classifyClaudeError(err) !== "claude_budget_exceeded") return "none";
  return notifyRateLimitedAlert(bot, err, {
    alertType: ALERT_TYPE.claude_budget_exceeded!,
    logPrefix: "[claude-budget] EXCEEDED",
    buildMessage: (errSnippet, kst) =>
      [
        `💸 <b>AI 호출 비용 상한 도달</b>`,
        `시각: ${kst} (KST)`,
        "",
        // 실제 상한은 아래 에러 조각의 cap= 이다 — 호출부가 maxBudgetUsd 를 넘기면 기본값과 다르다(9-1 info)
        `askAdvisor 호출당 상한(재시도 포함) · 기본값 $${ASK_ADVISOR_DEFAULT_MAX_BUDGET_USD.toFixed(2)} · 이번 값은 에러의 cap=`,
        `반복되면 서버 로그의 <code>[askAdvisor]</code> 줄(turns · cost)과 MCP·도구 오류 동반 여부를 확인`,
        "",
        `<b>에러</b>: ${errSnippet}`,
      ].join("\n"),
  });
}

export async function notifyMcpTransportDownIfNeeded(
  bot: BotProcess | undefined,
  err: unknown,
): Promise<AlertOutcome> {
  if (classifyClaudeError(err) !== "mcp_transport_down") return "none";
  return notifyRateLimitedAlert(bot, err, {
    alertType: ALERT_TYPE.mcp_transport_down!,
    logPrefix: "[mcp-transport] DOWN",
    buildMessage: (errSnippet, kst) =>
      [
        `🔧 <b>MCP transport 다운 감지</b>`,
        `시각: ${kst} (KST)`,
        "",
        `서버에서 상태 확인:`,
        `<code>pm2 status myfitness-mcp</code>`,
        `<code>curl -sf http://127.0.0.1:4301/health</code>`,
        "",
        `<b>에러</b>: ${errSnippet}`,
      ].join("\n"),
  });
}

export async function notifyGarminAuthFailedIfNeeded(
  bot: BotProcess | undefined,
  err: unknown,
): Promise<AlertOutcome> {
  if (!isGarminAuthError(err)) return "none";
  return notifyRateLimitedAlert(bot, err, {
    alertType: ALERT_TYPE.garmin_auth_failed!,
    logPrefix: "[garmin-auth] FAILED",
    buildMessage: (errSnippet, kst) =>
      [
        `⚠️ <b>Garmin 재인증 실패 감지</b>`,
        `시각: ${kst} (KST)`,
        "",
        `서버에서 확인:`,
        `<code>GARMIN_EMAIL / GARMIN_PASSWORD env 확인</code>`,
        `<code>Garmin 계정 상태 (locked / password 변경)</code>`,
        "",
        `<b>에러</b>: ${errSnippet}`,
      ].join("\n"),
  });
}

/** #514: OMRON 로그인 실패 (계정 · 비밀번호 · 앱 키) 만 알린다 — 네트워크 · 일시 오류는 다음 싱크에서 재시도 */
export async function notifyOmronAuthFailedIfNeeded(
  bot: BotProcess | undefined,
  err: unknown,
): Promise<AlertOutcome> {
  if (!(err instanceof OmronAuthError)) return "none";
  return notifyRateLimitedAlert(bot, err, {
    alertType: ALERT_TYPE.omron_auth_failed!,
    logPrefix: "[omron-auth] FAILED",
    buildMessage: (errSnippet, kst) =>
      [
        `⚠️ <b>OMRON Connect 인증 실패 감지</b>`,
        `시각: ${kst} (KST)`,
        "",
        `서버에서 확인:`,
        `<code>OMRON_EMAIL / OMRON_PASSWORD / OMRON_APP_ID / OMRON_APP_KEY env 확인</code>`,
        `<code>OMRON Connect 앱 로그인 상태 (비밀번호 변경 · 앱 업데이트)</code>`,
        "",
        `<b>에러</b>: ${errSnippet}`,
      ].join("\n"),
  });
}

// ─── 통합 dispatcher ────────────────────────────────────────────────────────

/**
 * 알려진 카테고리 (Claude auth / MCP transport / 비용 상한 #666) 중 어느 것에라도 매칭되면 해당 wrapper
 * 호출하고 결과(#673)를 돌려준다. 매칭 안 되면 none. 3개 catch 지점 (ai / scheduler / auto-adjust) 에서 통합 호출.
 *
 * **주의**: Garmin 은 이 dispatcher 로 오지 않도록 (classifyClaudeError 의 unauthorized
 * /authentication 패턴이 Garmin `Unauthorized` 를 claude_auth_expired 로 오분류) —
 * 사전 리뷰 P1 반영. Garmin context 가 명확한 지점 (syncAll) 에서는
 * `notifyGarminAuthFailedIfNeeded` 를 직접 호출한다.
 */
export async function notifyAdminIfKnownFailure(
  bot: BotProcess | undefined,
  err: unknown,
): Promise<AlertOutcome> {
  const category = classifyClaudeError(err);
  // Garmin 은 여기서 처리 안 함 — syncAll 등 context 명확한 지점에서 직접 호출.
  // 그 외 카테고리 (claude_rate_limit / tool_missing / network / unknown) 는 관리자 alert 아님.
  const send =
    category === "claude_auth_expired"
      ? notifyClaudeAuthExpiredIfNeeded
      : category === "mcp_transport_down"
        ? notifyMcpTransportDownIfNeeded
        : category === "claude_budget_exceeded"
          ? notifyClaudeBudgetExceededIfNeeded
          : null;
  if (!send) return "none";
  return waitAlertOutcome(send(bot, err));
}

/** #673: 결과를 기다리되 ADMIN_ALERT_WAIT_MS 를 넘기지 않는다 · 예외는 failed 로(던지지 않는다). */
async function waitAlertOutcome(pending: Promise<AlertOutcome>): Promise<AlertOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<AlertOutcome>((resolve) => {
    timer = setTimeout(() => resolve("pending"), ADMIN_ALERT_WAIT_MS);
  });
  try {
    return await Promise.race([pending.catch((): AlertOutcome => "failed"), limit]);
  } finally {
    clearTimeout(timer);
  }
}
