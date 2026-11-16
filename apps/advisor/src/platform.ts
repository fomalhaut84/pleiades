// 통합 층 플랫폼 설정 · 관리자 알림 (#686 · 012 E-a1 · Q137 · Q138).
// 값은 pleiades 루트 `.env`(서버는 PLEIADES_ENV_FILE) 의 플랫폼 키만 — `@pleiades/notify` platformEnv(프로세스 env 우선 · mtime 재읽기).
// 키 둘(봇 토큰 · 채널)은 기존 정규식에 맞다(012 §0-5 S4). 허용 = 전용 키(#685) — 비면 공유 목록. 값은 로그에 쓰지 않는다.
import { Route, createDiscordTransport, createNotifier, escapeHtml, html, platformEnv } from "@pleiades/notify";

export const BOT_TOKEN_KEY = "DISCORD_BOT_TOKEN_ADVISOR";
export const CHANNEL_KEY = "DISCORD_CHANNEL_ID_ADVISOR";
export const ALLOWED_KEY = "DISCORD_ALLOWED_USER_IDS_ADVISOR";
export const SHARED_ALLOWED_KEY = "DISCORD_ALLOWED_USER_IDS";

const ID = /^\d{5,25}$/;
const ids = (raw: string | undefined) => (raw ?? "").split(",").map((v) => v.trim()).filter((v) => ID.test(v));

export interface BotConfig {
  token: string;
  channelId: string;
  allowedUserIds: string[];
  /** 전용 키를 썼나(아니면 공유 목록) — 기동 로그용 */
  dedicatedAllow: boolean;
  ready: boolean;
}

/** 부를 때마다 읽는다 — 허용 사용자·채널을 바꾸면 다음 메시지부터(토큰은 chat 이 재접속 때) */
export function botConfig(env: (k: string) => string | undefined = platformEnv): BotConfig {
  const token = (env(BOT_TOKEN_KEY) ?? "").trim();
  const channel = (env(CHANNEL_KEY) ?? "").trim();
  const own = ids(env(ALLOWED_KEY));
  const allowedUserIds = own.length ? own : ids(env(SHARED_ALLOWED_KEY));
  const channelId = ID.test(channel) ? channel : "";
  return { token, channelId, allowedUserIds, dedicatedAllow: own.length > 0, ready: token !== "" && channelId !== "" };
}

/** fin notifier 와 같은 웹훅 형식 검사 — 아니면 수신자 0(토큰 담긴 URL 이 오류 메시지로 새지 않게 · #143) */
const WEBHOOK_RE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+(?:\?[\w=&-]*)?$/;
function webhook(env: (k: string) => string | undefined, key: string): string {
  const v = (env(key) ?? "").trim();
  return WEBHOOK_RE.test(v) ? v : "";
}

/**
 * 관리자 알림(Q137 — `DISCORD_WEBHOOK_ADMIN` 재사용 · 라벨 `[advisor]` 로 구분). 비면 보내지 않는다(로그만).
 * 본문은 정적 문구 + 숫자뿐 — 질문·답·ID 를 싣지 않는다. 실패는 삼키고 로그 한 줄.
 */
export function createAdminAlert(
  log: (line: string) => void,
  env: (k: string) => string | undefined = platformEnv,
): (text: string) => Promise<boolean> {
  return async (text) => {
    try {
      const r = await createNotifier({
        transport: () => createDiscordTransport({ webhooks: () => ({ admin: webhook(env, "DISCORD_WEBHOOK_ADMIN") }) }),
        targets: { ALLOWED: () => [], ADMIN: () => (webhook(env, "DISCORD_WEBHOOK_ADMIN") === "" ? [] : ["admin"]) },
      }).notify(Route.ADMIN, html(`<b>[advisor]</b> ${escapeHtml(text)}`), { label: "advisor" });
      if (r.sent === 0) log(`[advisor] 관리자 알림 미전송 (sent=0/total=${r.total})`);
      return r.sent > 0;
    } catch {
      log("[advisor] 관리자 알림 예외");
      return false;
    }
  };
}
