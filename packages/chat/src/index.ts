/**
 * @pleiades/chat — 인바운드 대화 계층(메시지 · 버튼 · 첨부 수신 + 플랫폼 중립 핸들러).
 * 설계 정본: pleiades `docs/specs/009-discord-only.md` §6 D-0 (#332). 송신(알림)은 `@pleiades/notify` 가 맡는다.
 */
export type {
  Attachment,
  Button,
  ButtonContext,
  ButtonHandler,
  ButtonRows,
  Logger,
  MessageContext,
  MessageHandler,
  Outgoing,
  OutgoingFile,
  OutgoingMessage,
  SentMessage,
  TextFormat,
} from './types';
export { createChat } from './chat';
export type { Chat, ChatOptions } from './chat';
export { createRouter, splitCommand } from './router';
export type { Router, CommandHandler, HearsHandler, PlainHandler, ActionHandler } from './router';
export { createIdentifyGuard, fileGuardStore, DEFAULT_IDENTIFY_LIMIT } from './identify-guard';
export type { IdentifyGuard, IdentifyGuardOptions, GuardStore, BlockInfo, BlockReason, GuardDecision } from './identify-guard';
export { DEFAULT_ATTACHMENT_POLICY } from './attachments';
export type { AttachmentPolicy } from './attachments';
export { MESSAGE_INTENTS } from './gateway';
export type { WebSocketLike, WebSocketFactory } from './gateway';
export type { ChatFetch, ChatResponse, ChatRequestInit } from './rest';
