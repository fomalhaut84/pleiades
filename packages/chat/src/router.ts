/**
 * 라우터 — 받은 메시지·버튼을 핸들러로 나눈다 (009 C-6: 일반 메시지 수신 · 한글 텍스트 명령·자연어 그대로).
 *
 * 메시지 순서: 첨부가 있고 첨부 경로가 있으면 → 첨부 · 아니면 명령(첫 단어) → 정규식(등록 순) → 나머지.
 * 명령 접두: 라우터마다 하나(`createRouter({ commandPrefix })` · 기본 `'/'`) · 명령마다 기본 **필수**(`prefix: 'required'` —
 * `sleep 어땠어` 같은 자연어가 명령으로 가지 않는다 · 009 D-2 R3) · `prefix: 'optional'` 로 등록한 명령만 접두 없이도 잡힌다(한글 이름 명령용).
 * Discord 입력창은 `/` 로 시작하는 글을 앱 명령 검색으로 가로채 일반 메시지로 보내지 않는다(X-1 실측 2026-10-28) — 앱은 `'!'` 같은 접두를 쓴다.
 * 버튼: action 접두(`'vest:'`) 또는 정규식 — 등록 순 첫 일치.
 * 빌더는 새 라우터를 돌려준다(원본 불변).
 */
import type { ButtonContext, MessageContext } from './types';

export type CommandHandler = (ctx: MessageContext, args: string) => Promise<void>;
export type HearsHandler = (ctx: MessageContext, match: RegExpMatchArray) => Promise<void>;
export type PlainHandler = (ctx: MessageContext) => Promise<void>;
export type ActionHandler = (ctx: ButtonContext, match: RegExpMatchArray | undefined) => Promise<void>;

export interface CommandOptions {
  /** 명령 접두 — 기본 `'required'`. `'optional'` 이면 접두 없이도 잡힌다. */
  prefix?: 'required' | 'optional';
}

interface Routes {
  commands: ReadonlyArray<{ names: readonly string[]; h: CommandHandler; prefixOptional: boolean }>;
  hears: ReadonlyArray<{ re: RegExp; h: HearsHandler }>;
  attachment?: PlainHandler;
  fallback?: PlainHandler;
  actions: ReadonlyArray<{ match: string | RegExp; h: ActionHandler }>;
}

export interface Router {
  command(names: string | readonly string[], h: CommandHandler, opts?: CommandOptions): Router;
  hears(re: RegExp, h: HearsHandler): Router;
  attachment(h: PlainHandler): Router;
  fallback(h: PlainHandler): Router;
  action(match: string | RegExp, h: ActionHandler): Router;
  /** 처리했으면 true. */
  handleMessage(ctx: MessageContext): Promise<boolean>;
  handleButton(ctx: ButtonContext): Promise<boolean>;
}

export interface RouterOptions {
  /** 명령 접두 — 기본 `'/'`. 빈 문자열·공백은 거부한다. */
  commandPrefix?: string;
}

const lower = (s: string): string => s.trim().toLowerCase();

/** 첫 단어와 나머지 — 공백·줄바꿈 어느 쪽으로도 나뉜다. */
export function splitCommand(text: string): { head: string; args: string } {
  const t = text.trim();
  const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(t);
  return m === null ? { head: '', args: '' } : { head: m[1], args: (m[2] ?? '').trim() };
}

function build(r: Routes, prefix: string): Router {
  const strip = (s: string): string => {
    const t = s.trim();
    return lower(t.startsWith(prefix) ? t.slice(prefix.length) : t);
  };
  return {
    command: (names, h, opts) =>
      build({
        ...r,
        commands: [
          ...r.commands,
          { names: (typeof names === 'string' ? [names] : names).map(strip), h, prefixOptional: opts?.prefix === 'optional' },
        ],
      }, prefix),
    hears: (re, h) => build({ ...r, hears: [...r.hears, { re, h }] }, prefix),
    attachment: (h) => build({ ...r, attachment: h }, prefix),
    fallback: (h) => build({ ...r, fallback: h }, prefix),
    action: (match, h) => build({ ...r, actions: [...r.actions, { match, h }] }, prefix),
    async handleMessage(ctx) {
      if (ctx.attachments.length > 0 && r.attachment !== undefined) {
        await r.attachment(ctx);
        return true;
      }
      const { head, args } = splitCommand(ctx.text);
      const name = strip(head);
      const prefixed = head.startsWith(prefix);
      if (name !== '') {
        const cmd = r.commands.find((c) => (prefixed || c.prefixOptional) && c.names.includes(name));
        if (cmd !== undefined) {
          await cmd.h(ctx, args);
          return true;
        }
      }
      for (const { re, h } of r.hears) {
        const m = ctx.text.match(re);
        if (m !== null) {
          await h(ctx, m);
          return true;
        }
      }
      if (r.fallback !== undefined) {
        await r.fallback(ctx);
        return true;
      }
      return false;
    },
    async handleButton(ctx) {
      for (const { match, h } of r.actions) {
        if (typeof match === 'string') {
          if (ctx.action.startsWith(match)) {
            await h(ctx, undefined);
            return true;
          }
          continue;
        }
        const m = ctx.action.match(match);
        if (m !== null) {
          await h(ctx, m);
          return true;
        }
      }
      return false;
    },
  };
}

export function createRouter(opts: RouterOptions = {}): Router {
  const prefix = opts.commandPrefix ?? '/';
  if (prefix.trim() === '' || /\s/.test(prefix)) throw new Error('@pleiades/chat: commandPrefix 는 공백 없는 문자여야 한다');
  return build({ commands: [], hears: [], actions: [] }, prefix);
}
