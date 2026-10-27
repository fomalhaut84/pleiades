/**
 * 라우터 — 받은 메시지·버튼을 핸들러로 나눈다 (009 C-6: 일반 메시지 수신 · 한글 텍스트 명령·자연어 그대로).
 *
 * 메시지 순서: 첨부가 있고 첨부 경로가 있으면 → 첨부 · 아니면 명령(첫 단어 · 앞 `/` 는 있어도 없어도) → 정규식(등록 순) → 나머지.
 * 버튼: action 접두(`'vest:'`) 또는 정규식 — 등록 순 첫 일치.
 * 빌더는 새 라우터를 돌려준다(원본 불변).
 */
import type { ButtonContext, MessageContext } from './types';

export type CommandHandler = (ctx: MessageContext, args: string) => Promise<void>;
export type HearsHandler = (ctx: MessageContext, match: RegExpMatchArray) => Promise<void>;
export type PlainHandler = (ctx: MessageContext) => Promise<void>;
export type ActionHandler = (ctx: ButtonContext, match: RegExpMatchArray | undefined) => Promise<void>;

interface Routes {
  commands: ReadonlyArray<{ names: readonly string[]; h: CommandHandler }>;
  hears: ReadonlyArray<{ re: RegExp; h: HearsHandler }>;
  attachment?: PlainHandler;
  fallback?: PlainHandler;
  actions: ReadonlyArray<{ match: string | RegExp; h: ActionHandler }>;
}

export interface Router {
  command(names: string | readonly string[], h: CommandHandler): Router;
  hears(re: RegExp, h: HearsHandler): Router;
  attachment(h: PlainHandler): Router;
  fallback(h: PlainHandler): Router;
  action(match: string | RegExp, h: ActionHandler): Router;
  /** 처리했으면 true. */
  handleMessage(ctx: MessageContext): Promise<boolean>;
  handleButton(ctx: ButtonContext): Promise<boolean>;
}

const norm = (s: string): string => s.trim().replace(/^\//, '').toLowerCase();

/** 첫 단어와 나머지 — 공백·줄바꿈 어느 쪽으로도 나뉜다. */
export function splitCommand(text: string): { head: string; args: string } {
  const t = text.trim();
  const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(t);
  return m === null ? { head: '', args: '' } : { head: m[1], args: (m[2] ?? '').trim() };
}

function build(r: Routes): Router {
  return {
    command: (names, h) => build({ ...r, commands: [...r.commands, { names: (typeof names === 'string' ? [names] : names).map(norm), h }] }),
    hears: (re, h) => build({ ...r, hears: [...r.hears, { re, h }] }),
    attachment: (h) => build({ ...r, attachment: h }),
    fallback: (h) => build({ ...r, fallback: h }),
    action: (match, h) => build({ ...r, actions: [...r.actions, { match, h }] }),
    async handleMessage(ctx) {
      if (ctx.attachments.length > 0 && r.attachment !== undefined) {
        await r.attachment(ctx);
        return true;
      }
      const { head, args } = splitCommand(ctx.text);
      const name = norm(head);
      if (name !== '') {
        const cmd = r.commands.find((c) => c.names.includes(name));
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

export function createRouter(): Router {
  return build({ commands: [], hears: [], actions: [] });
}
