import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createTelegramTransport, type TelegramApi } from './telegram';
import { html } from './types';

// 정본: fin telegram.ts:64 sendMessage(chatId, chunk, { parse_mode: 'HTML' }) · :68 plain 은 parse_mode 없음
//      fit send.ts:110-113 reply_markup 전달 · :115 message_id 캡처

function fakeApi(messageId = 42) {
  const sendMessage = vi.fn(async () => ({ message_id: messageId }));
  const api: TelegramApi = { sendMessage };
  return { api, sendMessage };
}

describe('createTelegramTransport', () => {
  it('channel telegram · maxLength 4096 (코어 소유 모드)', () => {
    const t = createTelegramTransport({ api: fakeApi().api });
    expect(t.channel).toBe('telegram');
    expect(t.maxLength).toBe(4096);
  });

  it('html 은 parse_mode HTML 로, ref 는 String(message_id)', async () => {
    const { api, sendMessage } = fakeApi(777);
    const t = createTelegramTransport({ api });
    await expect(t.send('123', html('<b>x</b>'))).resolves.toBe('777');
    expect(sendMessage).toHaveBeenCalledWith('123', '<b>x</b>', { parse_mode: 'HTML' });
  });

  it('plain 은 parse_mode 를 넣지 않는다 (fin :68 · fit :53)', async () => {
    const { api, sendMessage } = fakeApi();
    await createTelegramTransport({ api }).send('1', { text: 'x', format: 'plain' });
    expect(sendMessage).toHaveBeenCalledWith('1', 'x', {});
  });

  it('components 는 reply_markup 으로 그대로 전달된다', async () => {
    const kb = { inline_keyboard: [[{ text: 'ok', callback_data: 'c' }]] };
    const { api, sendMessage } = fakeApi();
    await createTelegramTransport({ api }).send('1', html('x', kb));
    expect(sendMessage).toHaveBeenCalledWith('1', 'x', { parse_mode: 'HTML', reply_markup: kb });
  });

  it('api 팩토리는 첫 send 에서 1회만 호출된다 (제약 1 — 봇 지연 생성)', async () => {
    const { api } = fakeApi();
    const factory = vi.fn(() => api);
    const t = createTelegramTransport({ api: factory });
    expect(factory).not.toHaveBeenCalled();
    await t.send('1', html('a'));
    await t.send('1', html('b'));
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('api 오류는 그대로 전파된다 (분류는 코어 몫)', async () => {
    const boom = new Error("Bad Request: can't parse entities");
    const api: TelegramApi = { sendMessage: async () => { throw boom; } };
    await expect(createTelegramTransport({ api }).send('1', html('<x>'))).rejects.toBe(boom);
  });
});

describe('패키지는 grammy 를 참조하지 않는다 (S-2 · 소비자 prepare 안전)', () => {
  it('src/*.ts (테스트 제외) 어디에도 "grammy" import 가 없다', () => {
    const dir = __dirname;
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/from\s+['"]grammy['"]/);
      expect(src, f).not.toMatch(/import\s*\(\s*['"]grammy['"]\s*\)/);
    }
  });
  it('package.json 에 dependencies · peerDependencies 가 없다', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.peerDependencies).toBeUndefined();
  });
});
