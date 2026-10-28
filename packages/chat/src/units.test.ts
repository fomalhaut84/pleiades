import { describe, expect, it, vi } from 'vitest';
import { channelAllowed, isAllowed } from './auth';
import { toComponents } from './buttons';
import { createRouter, splitCommand } from './router';
import type { ButtonContext, MessageContext } from './types';

describe('isAllowed — 사용자 AND 채널 (0-2)', () => {
  const users = () => ['1234567890123456789'];
  const channels = () => [' 2222222222222222222 '];
  it('둘 다 맞으면 허용', () => {
    expect(isAllowed('1234567890123456789', '2222222222222222222', users, channels)).toBe(true);
  });
  it('하나라도 틀리면 거부', () => {
    expect(isAllowed('1234567890123456789', '9', users, channels)).toBe(false);
    expect(isAllowed('9', '2222222222222222222', users, channels)).toBe(false);
  });
  it('64비트 ID 를 숫자로 바꾸지 않는다 — 끝자리만 다른 ID 를 거부(R4)', () => {
    // Number('1234567890123456789') === Number('1234567890123456788') 이다 — 숫자 비교면 통과해 버린다
    expect(Number('1234567890123456789')).toBe(Number('1234567890123456788'));
    expect(isAllowed('1234567890123456788', '2222222222222222222', users, channels)).toBe(false);
  });
  it('목록이 비면 전부 거부(fail-closed · R8)', () => {
    expect(isAllowed('1', '2', () => [], () => ['2'])).toBe(false);
    expect(isAllowed('1', '2', () => ['1'], () => [])).toBe(false);
    expect(isAllowed('', '', () => [''], () => [''])).toBe(false);
  });
  it('channelAllowed 는 채널만 본다', () => {
    expect(channelAllowed('2222222222222222222', channels)).toBe(true);
    expect(channelAllowed('', () => [''])).toBe(false);
  });
});

describe('toComponents — 중립 버튼 → Discord 행', () => {
  it('action → custom_id · url → 링크 버튼', () => {
    expect(toComponents([[{ label: '확인', action: 'vest:ok:1' }, { label: '열기', url: 'https://example.com' }]])).toEqual([
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: '확인', custom_id: 'vest:ok:1' },
          { type: 2, style: 5, label: '열기', url: 'https://example.com' },
        ],
      },
    ]);
  });
  it('빈 행은 건너뛰고 [] 는 버튼 제거(빈 배열)', () => {
    expect(toComponents([[], [{ label: 'a', action: 'a' }]])).toHaveLength(1);
    expect(toComponents([])).toEqual([]);
  });
  it('한도를 넘으면 자르지 않고 던진다', () => {
    const b = { label: 'x', action: 'x' };
    expect(() => toComponents(Array.from({ length: 6 }, () => [b]))).toThrow(/행은 5/);
    expect(() => toComponents([Array.from({ length: 6 }, () => b)])).toThrow(/행당 5/);
    expect(() => toComponents([[{ label: 'x', action: 'a'.repeat(101) }]])).toThrow(/action/);
    expect(() => toComponents([[{ label: 'y'.repeat(81), action: 'a' }]])).toThrow(/이름/);
  });
  it('action 과 url 은 하나만 · url 은 http(s)', () => {
    expect(() => toComponents([[{ label: 'x' }]])).toThrow(/하나만/);
    expect(() => toComponents([[{ label: 'x', action: 'a', url: 'https://a' }]])).toThrow(/하나만/);
    expect(() => toComponents([[{ label: 'x', url: 'javascript:alert(1)' }]])).toThrow(/http/);
  });
});

const msgCtx = (text: string, attachments: MessageContext['attachments'] = []): MessageContext => ({
  platform: 'discord',
  userId: '1',
  channelId: '2',
  messageId: '3',
  text,
  attachments,
  sentAt: 0,
  reply: vi.fn(),
  replyFile: vi.fn(),
  typing: vi.fn(),
});

describe('router — 메시지 (C-6 일반 메시지)', () => {
  it('splitCommand: 첫 단어와 나머지(줄바꿈 포함)', () => {
    expect(splitCommand('  /잔고  삼성 전자 ')).toEqual({ head: '/잔고', args: '삼성 전자' });
    expect(splitCommand('기록\n둘째 줄')).toEqual({ head: '기록', args: '둘째 줄' });
    expect(splitCommand('   ')).toEqual({ head: '', args: '' });
  });
  it("prefix 'optional' 명령은 앞 `/` 가 있어도 없어도 같다 · 영문은 대소문자 무시", async () => {
    const h = vi.fn(async () => {});
    const r = createRouter().command(['잔고', 'Balance'], h, { prefix: 'optional' });
    await r.handleMessage(msgCtx('/잔고 삼성'));
    await r.handleMessage(msgCtx('잔고'));
    await r.handleMessage(msgCtx('/balance'));
    expect(h.mock.calls.map((c) => (c as unknown[])[1])).toEqual(['삼성', '', '']);
  });
  // 회귀: 009 D-2 R3 — 영어 명령 이름(sleep · run)이 자연어·편집 입력의 첫 단어를 가로채지 않는다
  it('명령은 기본으로 앞 `/` 가 있어야 한다 — 접두 없는 첫 단어는 정규식·나머지로', async () => {
    const cmd = vi.fn(async () => {});
    const rest = vi.fn(async () => {});
    const r = createRouter().command(['sleep', 'today'], cmd).fallback(rest);
    await r.handleMessage(msgCtx('sleep 어땠어?'));
    await r.handleMessage(msgCtx('/today'));
    await r.handleMessage(msgCtx('/TODAY 상세'));
    await r.handleMessage(msgCtx('today'));
    expect(cmd.mock.calls.map((c) => (c as unknown[])[1])).toEqual(['', '상세']);
    expect(rest.mock.calls.map((c) => ((c as unknown[])[0] as MessageContext).text)).toEqual(['sleep 어땠어?', 'today']);
  });
  // 회귀: 009 D-2 X-1 실측 — Discord 입력창은 `/…` 를 앱 명령 검색으로 가로챈다 → 앱은 `!` 접두
  it("commandPrefix '!' — `!today` 만 명령 · `/today` 와 접두 없는 첫 단어는 나머지로", async () => {
    const cmd = vi.fn(async () => {});
    const rest = vi.fn(async () => {});
    const r = createRouter({ commandPrefix: '!' }).command(['today', 'food_kcal'], cmd).fallback(rest);
    await r.handleMessage(msgCtx('!today'));
    await r.handleMessage(msgCtx('!FOOD_KCAL 350'));
    await r.handleMessage(msgCtx('/today'));
    await r.handleMessage(msgCtx('today 뭐 먹지'));
    expect(cmd.mock.calls.map((c) => (c as unknown[])[1])).toEqual(['', '350']);
    expect(rest.mock.calls.map((c) => ((c as unknown[])[0] as MessageContext).text)).toEqual(['/today', 'today 뭐 먹지']);
  });
  it.each(['', ' ', '! '])('commandPrefix %j 는 거부한다', (bad) => {
    expect(() => createRouter({ commandPrefix: bad })).toThrow(/commandPrefix/);
  });
  it('명령 → 정규식(등록 순) → 나머지 순서', async () => {
    const order: string[] = [];
    const r = createRouter()
      .hears(/체중\s*(\d+)/, async (_c, m) => void order.push(`hears1:${m[1]}`))
      .hears(/체중/, async () => void order.push('hears2'))
      .command('체중', async () => void order.push('cmd'))
      .fallback(async () => void order.push('fallback'));
    await r.handleMessage(msgCtx('/체중'));
    await r.handleMessage(msgCtx('오늘 체중 72'));
    await r.handleMessage(msgCtx('안녕'));
    expect(order).toEqual(['cmd', 'hears1:72', 'fallback']);
  });
  it('첨부 경로가 있으면 첨부가 먼저 · 없으면 텍스트 경로', async () => {
    const att = { id: 'a', name: 'p.jpg', size: 1, contentType: 'image/jpeg', download: vi.fn() };
    const onAtt = vi.fn(async () => {});
    const onText = vi.fn(async () => {});
    await createRouter().attachment(onAtt).fallback(onText).handleMessage(msgCtx('사진', [att]));
    expect(onAtt).toHaveBeenCalledOnce();
    expect(onText).not.toHaveBeenCalled();
    await createRouter().fallback(onText).handleMessage(msgCtx('사진', [att]));
    expect(onText).toHaveBeenCalledOnce();
  });
  it('일치가 없으면 false · 빌더는 원본을 바꾸지 않는다', async () => {
    const base = createRouter();
    const withCmd = base.command('a', async () => {});
    expect(await base.handleMessage(msgCtx('/a'))).toBe(false);
    expect(await withCmd.handleMessage(msgCtx('/a'))).toBe(true);
  });
});

describe('router — 버튼', () => {
  const btn = (action: string): ButtonContext => ({
    platform: 'discord',
    userId: '1',
    channelId: '2',
    messageId: '3',
    action,
    edit: vi.fn(),
    setButtons: vi.fn(),
    notice: vi.fn(),
    send: vi.fn(),
  });
  it('접두 문자열 · 정규식 — 등록 순 첫 일치', async () => {
    const seen: string[] = [];
    const r = createRouter()
      .action('vest:', async (c) => void seen.push(`prefix:${c.action}`))
      .action(/^adj:(\w+)$/, async (_c, m) => void seen.push(`re:${m?.[1]}`));
    expect(await r.handleButton(btn('vest:ok:1'))).toBe(true);
    expect(await r.handleButton(btn('adj:yes'))).toBe(true);
    expect(await r.handleButton(btn('other'))).toBe(false);
    expect(seen).toEqual(['prefix:vest:ok:1', 're:yes']);
  });
});
