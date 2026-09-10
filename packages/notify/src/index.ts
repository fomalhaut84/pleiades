/**
 * @pleiades/notify — 아웃바운드 알림 포트(`Transport`) + 파사드(`Notifier`) + `TelegramTransport`.
 * 설계 정본: pleiades `docs/specs/003-notify-package.md` §4 (L3 · 2층). 1a-1 (#47).
 */
export const VERSION = '0.0.0';

export type {
  BroadcastResult,
  Components,
  Content,
  Delivery,
  Logger,
  MessageRef,
  Notifier,
  NotifierConfig,
  NotifyContext,
  Transport,
  TransportRef,
} from './types';
export { Route, html } from './types';

export { createNotifier } from './notifier';
export { createTelegramTransport, TELEGRAM_CHANNEL } from './telegram';
export type { TelegramApi, TelegramTransportOptions } from './telegram';

export { deliverOne, DEFAULT_RETRY_DELAYS_MS } from './deliver';
export type { DeliveryPolicy } from './deliver';

export { csvEnv } from './targets';
export type { CsvEnvOptions } from './targets';
export { splitMessage, TELEGRAM_MAX_LENGTH } from './split';
export { toPlain } from './plain';
export { escapeHtml } from './escape';
export { getErrorCode, isHtmlParseError, isNetworkError, sanitizeError, sanitizeMessage } from './error';
