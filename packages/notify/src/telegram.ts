/**
 * TelegramTransport — 포트 구현. 채널 1개 · 대상 1개 · 청크 1건 (`maxLength: 4096` → 코어 소유 모드).
 *
 * grammy 를 참조하지 않는다 (1a-1 계획 S-2 · 감사 A-1): 소비자는 `bot.api` 를 구조적 타입 `TelegramApi` 로 넘긴다.
 * `sendMessage` 는 **메서드 단축 문법**이어야 grammy `Api.sendMessage` 가 양변성으로 대입된다 — 프로퍼티(화살표) 문법으로 바꾸면
 * TS2322 (감사 V8). `parse_mode?: string` 은 grammy `ParseMode` 유니온보다 넓어야 한다 (감사 V1 — `'HTML'` 리터럴은 TS2322).
 *
 * 정본: fin `telegram.ts:64,68` (html 은 `parse_mode: 'HTML'` · plain 은 옵션 없음) · fit `send.ts:110-115` (`reply_markup` · `message_id`).
 */
import type { Content, MessageRef, Transport } from './types';

export interface TelegramApi {
  sendMessage(
    chatId: string | number,
    text: string,
    other?: { parse_mode?: string; reply_markup?: unknown },
  ): Promise<{ message_id: number }>;
}

export interface TelegramTransportOptions {
  /** `bot.api` 또는 그것을 돌려주는 팩토리 (003 §4-3 제약 1 — 봇 지연 생성). */
  api: TelegramApi | (() => TelegramApi);
}

export const TELEGRAM_CHANNEL = 'telegram';

export function createTelegramTransport(opts: TelegramTransportOptions): Transport {
  let api: TelegramApi | undefined = typeof opts.api === 'function' ? undefined : opts.api;
  const getApi = (): TelegramApi => (api ??= (opts.api as () => TelegramApi)());

  return {
    channel: TELEGRAM_CHANNEL,
    maxLength: 4096,
    async send(target: string, content: Content): Promise<MessageRef> {
      const other: { parse_mode?: string; reply_markup?: unknown } = {};
      if (content.format === 'html') other.parse_mode = 'HTML';
      if (content.components !== undefined) other.reply_markup = content.components;
      const msg = await getApi().sendMessage(target, content.text, other);
      return String(msg.message_id);
    },
  };
}
