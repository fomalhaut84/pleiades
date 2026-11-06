/**
 * @pleiades/notify — 아웃바운드 알림 포트(`Transport`) + 파사드(`Notifier`) + Discord transport(웹훅 · 봇).
 * 009 D-5 B5 (pleiades#515): `TelegramTransport` 는 지웠다.
 * 설계 정본: pleiades `docs/specs/003-notify-package.md` §4 (L3 · 2층). 1a-1 (#47).
 */

export type {
  BroadcastResult,
  Components,
  ButtonRows,
  NotifyButton,
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
export {
  createDiscordTransport,
  DiscordWebhookError,
  DISCORD_CHANNEL,
  DISCORD_MAX_LENGTH,
  toDiscordContent,
  sendDiscordFile,
  DISCORD_DEFAULT_MAX_FILE_BYTES,
  requestDiscord,
  defaultSleep,
} from './discord';
export type {
  DiscordTransportOptions,
  DiscordFile,
  SendDiscordFileOptions,
  FetchLike,
  FetchResponseLike,
  FormDataLike,
  RequestInitLike,
  PostConfig,
} from './discord';
export { htmlToDiscordMarkdown, escapeDiscordMarkdown, splitDiscordMarkdown } from './discord-md';
export {
  createDiscordBotTransport,
  toDiscordComponents,
  DISCORD_BOT_CHANNEL,
  DISCORD_API_BASE,
} from './discord-bot';
export type { DiscordBotTransportOptions, DiscordActionRow, DiscordButton } from './discord-bot';
export { createDiscordGateway } from './discord-gateway';
export type {
  DiscordGateway,
  DiscordGatewayOptions,
  DiscordButtonContext,
  WebSocketLike,
  WebSocketFactory,
} from './discord-gateway';
export {
  platformEnv,
  parsePlatformEnv,
  parseEnvValue,
  findPlatformEnvFile,
  resetPlatformEnvCache,
  PLATFORM_KEY_RE,
} from './platform-env';

export { deliverOne, DEFAULT_RETRY_DELAYS_MS } from './deliver';
export type { DeliveryPolicy } from './deliver';

export { csvEnv } from './targets';
export type { CsvEnvOptions } from './targets';
export { splitMessage } from './split';
export { toPlain } from './plain';
export { escapeHtml } from './escape';
export { getErrorCode, isHtmlParseError, isNetworkError, sanitizeError, sanitizeMessage } from './error';
