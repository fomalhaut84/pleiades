import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findPlatformEnvFile,
  parseEnvValue,
  parsePlatformEnv,
  PLATFORM_KEY_RE,
  platformEnv,
  resetPlatformEnvCache,
} from './platform-env';

describe('parseEnvValue', () => {
  it('따옴표 값은 닫는 따옴표까지 · 뒤 주석은 버린다', () => {
    expect(parseEnvValue('"discord"   # 주석')).toBe('discord');
    expect(parseEnvValue("'https://x/a#frag'")).toBe('https://x/a#frag');
    expect(parseEnvValue('""')).toBe('');
  });

  it('따옴표 없는 값은 공백+# 앞까지 — URL 안의 # 는 남는다', () => {
    expect(parseEnvValue('discord # 주석')).toBe('discord');
    expect(parseEnvValue('https://x/a#frag')).toBe('https://x/a#frag');
  });

  it('해석할 수 없으면 undefined — 짝 없는 따옴표 · 닫는 따옴표 뒤 글자', () => {
    expect(parseEnvValue('"discord')).toBeUndefined();
    expect(parseEnvValue('"discord" x')).toBeUndefined();
  });
});

describe('parsePlatformEnv', () => {
  it('플랫폼 키만 읽는다 — 봇 토큰·DB URL·주석 줄은 버린다', () => {
    const r = parsePlatformEnv(
      [
        'NOTIFY_ALLOWED_CHANNEL="discord"',
        'export DISCORD_WEBHOOK_FINANCE=https://discord.com/api/webhooks/1/t',
        'APP_BOT_TOKEN=111:secret',
        'DATABASE_URL=postgresql://svc/prod',
        '# NOTIFY_ADMIN_CHANNEL=discord',
        'notify_lower=1',
        'DISCORD_TOKEN=x',
      ].join('\r\n'),
    );
    expect(r).toEqual({
      values: { NOTIFY_ALLOWED_CHANNEL: 'discord', DISCORD_WEBHOOK_FINANCE: 'https://discord.com/api/webhooks/1/t' },
      invalid: [],
    });
  });

  it('해석할 수 없는 플랫폼 키는 invalid 로 — 값은 담지 않는다', () => {
    expect(parsePlatformEnv('NOTIFY_ALLOWED_CHANNEL="discord\nAPP_BOT_TOKEN="x')).toEqual({
      values: {},
      invalid: ['NOTIFY_ALLOWED_CHANNEL'],
    });
  });
});

describe('platformEnv — 루트 .env 와 프로세스 env', () => {
  let root: string;
  let cwd: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pleiades-root-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'pleiades' }));
    mkdirSync(join(root, 'apps', 'finance'), { recursive: true });
    writeFileSync(join(root, 'apps', 'finance', 'package.json'), JSON.stringify({ name: 'myfinance' }));
    cwd = vi.spyOn(process, 'cwd').mockReturnValue(join(root, 'apps', 'finance'));
    vi.stubEnv('PLEIADES_ENV_FILE', '');
    vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', undefined as unknown as string);
    delete process.env.NOTIFY_ALLOWED_CHANNEL;
    resetPlatformEnvCache();
  });
  afterEach(() => {
    cwd.mockRestore();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
    resetPlatformEnvCache();
  });

  it('앱 디렉터리에서 위로 올라가 name=pleiades 의 .env 를 찾는다', () => {
    writeFileSync(join(root, '.env'), 'NOTIFY_ALLOWED_CHANNEL=discord\n');
    expect(findPlatformEnvFile()).toBe(join(root, '.env'));
    expect(platformEnv('NOTIFY_ALLOWED_CHANNEL')).toBe('discord');
  });

  it('프로세스 env 가 이긴다 — 빈 문자열도 설정된 값이다', () => {
    writeFileSync(join(root, '.env'), 'NOTIFY_ALLOWED_CHANNEL=discord\n');
    vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', '');
    expect(platformEnv('NOTIFY_ALLOWED_CHANNEL')).toBe('');
  });

  it('PLEIADES_ENV_FILE 이 경로를 정한다 (서버 배포 등)', () => {
    const other = join(root, 'elsewhere.env');
    writeFileSync(other, 'DISCORD_WEBHOOK_FITNESS="https://discord.com/api/webhooks/2/t"\n');
    vi.stubEnv('PLEIADES_ENV_FILE', other);
    expect(platformEnv('DISCORD_WEBHOOK_FITNESS')).toBe('https://discord.com/api/webhooks/2/t');
  });

  it('루트 .env 가 없거나 루트를 못 찾으면 undefined', () => {
    expect(platformEnv('NOTIFY_ALLOWED_CHANNEL')).toBeUndefined();
    cwd.mockReturnValue(tmpdir());
    resetPlatformEnvCache();
    expect(platformEnv('NOTIFY_ALLOWED_CHANNEL')).toBeUndefined();
  });

  it('해석할 수 없는 값은 경고 한 번 · 키 이름만', () => {
    writeFileSync(join(root, '.env'), 'NOTIFY_ALLOWED_CHANNEL="disc\nAPP_BOT_TOKEN=111:topsecret\n');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(platformEnv('NOTIFY_ALLOWED_CHANNEL')).toBeUndefined();
    platformEnv('NOTIFY_ADMIN_CHANNEL');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('NOTIFY_ALLOWED_CHANNEL');
    expect(String(warn.mock.calls[0][0])).not.toContain('topsecret');
    warn.mockRestore();
  });

  // 회귀: #143 사전 리뷰 major — 재시작 없이 되돌리기(키 지우기)·켜기(파일 생성)가 반영된다
  it('파일을 고치거나 새로 만들면 다음 호출부터 반영된다 (mtime)', () => {
    const file = join(root, '.env');
    expect(platformEnv('NOTIFY_ALLOWED_CHANNEL')).toBeUndefined(); // 없던 파일
    writeFileSync(file, 'NOTIFY_ALLOWED_CHANNEL=discord\n');
    utimesSync(file, new Date(), new Date(Date.now() + 1000));
    expect(platformEnv('NOTIFY_ALLOWED_CHANNEL')).toBe('discord'); // 생성 반영
    writeFileSync(file, '# 되돌림\n');
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect(platformEnv('NOTIFY_ALLOWED_CHANNEL')).toBeUndefined(); // 수정 반영
    rmSync(file);
    expect(platformEnv('NOTIFY_ALLOWED_CHANNEL')).toBeUndefined(); // 삭제 반영
  });

  it('BOM 으로 시작하는 파일의 첫 줄도 읽는다', () => {
    writeFileSync(join(root, '.env'), '\uFEFFNOTIFY_ALLOWED_CHANNEL=discord\n');
    expect(platformEnv('NOTIFY_ALLOWED_CHANNEL')).toBe('discord');
  });

  it('깨진 package.json 은 건너뛰고 위로 올라간다', () => {
    writeFileSync(join(root, 'apps', 'finance', 'package.json'), '{ broken');
    writeFileSync(join(root, '.env'), 'NOTIFY_ALLOWED_CHANNEL=discord\n');
    expect(findPlatformEnvFile()).toBe(join(root, '.env'));
  });

  it('플랫폼 키가 아닌 이름은 거부한다 — 봇 토큰을 이 경로로 읽지 못한다', () => {
    expect(() => platformEnv('APP_BOT_TOKEN')).toThrow('플랫폼 키가 아니다');
  });

  // #685 · 012 Q138 — 통합 층 전용 허용 사용자 키는 플랫폼 키다(정확한 이름만 · 접미사 와일드카드 아님)
  it('DISCORD_ALLOWED_USER_IDS_ADVISOR 는 플랫폼 키 · 다른 접미사는 아니다', () => {
    expect(PLATFORM_KEY_RE.test('DISCORD_ALLOWED_USER_IDS_ADVISOR')).toBe(true);
    expect(PLATFORM_KEY_RE.test('DISCORD_ALLOWED_USER_IDS_FINANCE')).toBe(false);
    expect(parsePlatformEnv('DISCORD_ALLOWED_USER_IDS_ADVISOR="1,2"\n').values).toEqual({ DISCORD_ALLOWED_USER_IDS_ADVISOR: '1,2' });
  });
});
