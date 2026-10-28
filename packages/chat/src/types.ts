/**
 * @pleiades/chat 공개 계약 — 플랫폼 중립 (009 C-2 · 0-6 · S-1).
 *
 * 핸들러는 이 타입만 본다. 플랫폼 프로토콜(Discord payload · 인터랙션 토큰 · URL)은 노출하지 않는다.
 * 이 파일과 index 가 내보내는 이름에 특정 메신저의 어휘를 두지 않는다 — `dist/*.d.ts` 를 테스트가 검사한다.
 */

export type Logger = Pick<Console, 'warn' | 'error'>;

/** 본문 형식 — `html` 은 앱이 지금 쓰는 태그 마크업(<b> · <i> · <code> · <a>)을 플랫폼 표기로 바꾼다. */
export type TextFormat = 'plain' | 'html';

/** 버튼 하나. `action` 은 누르면 핸들러로 오는 값(1~100자) · `url` 은 링크 버튼. 둘 중 하나만. */
export interface Button {
  label: string;
  action?: string;
  url?: string;
}
/** 버튼 행 목록 — 행 5 · 행당 5 까지. */
export type ButtonRows = readonly (readonly Button[])[];

export interface OutgoingMessage {
  text: string;
  /** 기본 `plain`(글자 그대로 보인다). */
  format?: TextFormat;
  /** 마지막 조각에만 붙는다. 편집에서 `undefined` = 기존 버튼 유지 · `[]` = 버튼 제거. */
  buttons?: ButtonRows;
}
/** 문자열은 `{ text, format: 'plain' }` 과 같다. */
export type Outgoing = string | OutgoingMessage;

export interface OutgoingFile {
  name: string;
  data: Uint8Array;
  contentType?: string;
  /** 파일과 함께 보이는 짧은 설명(plain · 2000자 첫 조각). */
  caption?: string;
}

/** 보낸 메시지 — 나중에 고칠 수 있다(인터랙션 밖 편집 · 0-3). */
export interface SentMessage {
  readonly id: string;
  readonly channelId: string;
  /** 본문을 바꾼다. 2000자를 넘으면 첫 조각으로 바꾸고 나머지는 새 메시지로 잇는다(잘라 버리지 않는다). */
  edit(msg: Outgoing): Promise<void>;
  /** 본문은 두고 버튼만 바꾼다 — `[]` 면 지운다. */
  setButtons(rows: ButtonRows): Promise<void>;
  /** 메시지를 지운다(진행 안내 같은 임시 메시지 · 009 D-2 C). 이미 없으면 조용히 끝난다. */
  delete(): Promise<void>;
}

/** 받은 첨부. 내용은 `download()` 로만 — 크기·형식 검증을 거친다(0-3 · R6). */
export interface Attachment {
  readonly id: string;
  readonly name: string;
  /** 플랫폼이 알려 준 바이트 수. */
  readonly size: number;
  readonly contentType: string | undefined;
  /** 상한(`maxAttachmentBytes`)·형식(`allowedAttachmentTypes`)을 넘으면 던진다 — 내려받는 도중에도 끊는다. */
  download(): Promise<Uint8Array>;
}

interface BaseContext {
  readonly platform: 'discord';
  readonly userId: string;
  readonly channelId: string;
  readonly messageId: string;
}

/** 일반 메시지(텍스트·첨부). */
export interface MessageContext extends BaseContext {
  readonly text: string;
  readonly attachments: readonly Attachment[];
  /** 사용자가 보낸 시각(epoch ms) — 플랫폼 시각 · 없으면 메시지 ID · 그것도 없으면 받은 시각(009 D-2 C). */
  readonly sentAt: number;
  /** "입력 중" 표시(약 10초 지속 — 긴 작업이면 다시 부른다). 실패는 삼키고 경고만 남긴다. */
  typing(): Promise<void>;
  /** 같은 채널에 보낸다 · 2000자를 넘으면 나눠 보내고 버튼은 마지막에(R1). */
  reply(msg: Outgoing): Promise<SentMessage>;
  replyFile(file: OutgoingFile): Promise<SentMessage>;
}

/** 버튼 누름. */
export interface ButtonContext extends BaseContext {
  readonly action: string;
  /** 버튼이 달린 원본 메시지를 바꾼다. `buttons` 를 주지 않으면 버튼을 지운다(눌린 버튼이 남지 않게). */
  edit(msg: Outgoing): Promise<void>;
  /** 본문은 두고 버튼만 바꾼다 — `[]` 면 지운다. */
  setButtons(rows: ButtonRows): Promise<void>;
  /** 누른 사람에게만 보이는 짧은 안내. */
  notice(text: string): Promise<void>;
  /** 같은 채널에 새 메시지(모두에게 보인다). */
  send(msg: Outgoing): Promise<SentMessage>;
}

export type MessageHandler = (ctx: MessageContext) => Promise<void>;
export type ButtonHandler = (ctx: ButtonContext) => Promise<void>;
