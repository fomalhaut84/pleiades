// 013 P2-a (#756) — markdown 형식 · Discord 정리기 · 형식마다 한 길
import { describe, expect, it } from 'vitest';
import { discordMarkdown, toDiscordMarkdown } from './discord-markdown';
import { escapeDiscordMarkdown, htmlToDiscordMarkdown } from './discord-md';
import type { BodyFormat } from './types';

describe('toDiscordMarkdown — 형식마다 한 길', () => {
  it('html · plain 은 옛 변환과 같다(무변경)', () => {
    const h = '<b>제목</b>\n- 항목 *별*';
    expect(toDiscordMarkdown(h, 'html')).toBe(htmlToDiscordMarkdown(h));
    expect(toDiscordMarkdown(h, 'plain')).toBe(escapeDiscordMarkdown(h));
  });

  it('markdown 은 escape 되지 않는다 — 목록 · 제목 · 굵게가 산다', () => {
    const md = '## 오늘 요약\n- **삼성전자** +1.2%\n1. 첫째\n> 인용';
    expect(toDiscordMarkdown(md, 'markdown')).toBe(md);
  });

  it('모르는 형식은 조용히 escape 하지 않고 던진다', () => {
    expect(() => toDiscordMarkdown('x', 'telegram' as unknown as BodyFormat)).toThrow(/알 수 없는 본문 형식/);
  });
});

describe('discordMarkdown — 표 → 행 목록(F1)', () => {
  it('헤더 · 구분 줄 · 행 → `- **첫 열** — 헤더: 값 · …`', () => {
    const md = ['| 종목 | 비중 | 수익률 |', '|---|:---:|---:|', '| 삼성전자 | 18% | +12.4% |', '| **AAPL** | 15% | +8.1% |'].join('\n');
    expect(discordMarkdown(md)).toBe(
      ['- **삼성전자** — 비중: 18% · 수익률: +12.4%', '- **AAPL** — 비중: 15% · 수익률: +8.1%'].join('\n'),
    );
  });

  it('바깥 파이프 없는 표 · 빈 칸은 뺀다 · `\\|` 는 칸 안의 글자', () => {
    const md = ['이름 | 값 | 메모', '--- | --- | ---', 'a | 1 |', 'b | x \\| y | 비고'].join('\n');
    expect(discordMarkdown(md)).toBe(['- **a** — 값: 1', '- **b** — 값: x | y · 메모: 비고'].join('\n'));
  });

  it('표 앞뒤 글은 그대로 · 표가 아닌 `|` 줄은 그대로', () => {
    const md = ['요약', '| a | b |', '| - | - |', '| 1 | 2 |', '', 'x | y 는 표가 아니다'].join('\n');
    expect(discordMarkdown(md)).toBe(['요약', '- **1** — b: 2', '', 'x | y 는 표가 아니다'].join('\n'));
  });

  it('코드 블록 안의 표는 바꾸지 않는다(R8)', () => {
    const md = ['```', '| a | b |', '|---|---|', '| 1 | 2 |', '```'].join('\n');
    expect(discordMarkdown(md)).toBe(md);
  });
});

describe('discordMarkdown — 해가 되는 것만 막는다(013 §4-2)', () => {
  it('R2 가짜 링크는 주소를 펼친다 · 글 = 주소면 주소만', () => {
    expect(discordMarkdown('[여기](https://evil.example/x) 를 보라')).toBe('여기 (https://evil.example/x) 를 보라');
    expect(discordMarkdown('[https://a.b/c](https://a.b/c)')).toBe('https://a.b/c');
    expect(discordMarkdown('[공시](<https://dart.fss.or.kr/x>)')).toBe('공시 (https://dart.fss.or.kr/x)');
  });

  it('R3 `<` 는 모두 escape — 멘션 · 채널 · 타임스탬프 · 명령 · 이모지 표기가 되지 않는다', () => {
    expect(discordMarkdown('<@123> <#456> <t:1700000000:R> </cmd:1> <:e:1> <a:x:2>')).toBe(
      '\\<@123> \\<#456> \\<t:1700000000:R> \\</cmd:1> \\<:e:1> \\<a:x:2>',
    );
    expect(discordMarkdown('a < b · <5%')).toBe('a \\< b · \\<5%');
    expect(discordMarkdown('이미 \\<x')).toBe('이미 \\<x'); // 두 번 막지 않는다
  });

  it('R4 `>>> ` 는 다음 빈 줄까지 각 줄 `> `', () => {
    expect(discordMarkdown('>>> 첫 줄\n둘째 줄\n\n밖')).toBe('> 첫 줄\n> 둘째 줄\n\n밖');
  });

  it('R5 `-#` · 스포일러는 그대로(해 없음)', () => {
    expect(discordMarkdown('-# 작은 글씨\n||스포일러||')).toBe('-# 작은 글씨\n||스포일러||');
  });

  it('`####` 이하 제목 → 굵은 줄 · `#`~`###` 는 그대로 · 가로줄 → 빈 줄', () => {
    expect(discordMarkdown('# A\n### C\n#### D ##\n---\n***\n본문')).toBe('# A\n### C\n**D**\n\n\n본문');
  });

  it('R8 코드 안은 바꾸지 않는다 — 인라인 코드 · 코드 블록', () => {
    expect(discordMarkdown('`<@1> [a](https://x.y)` 밖 <b>')).toBe('`<@1> [a](https://x.y)` 밖 \\<b>');
    const block = '```ts\nconst a = b < c;\n[x](https://y.z)\n```';
    expect(discordMarkdown(block)).toBe(block);
  });

  it('CRLF 를 LF 로', () => {
    expect(discordMarkdown('a\r\nb\rc')).toBe('a\nb\nc');
  });
});
