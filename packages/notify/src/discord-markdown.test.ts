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

  // 회귀: #756 9-1 critical — 같은 줄에서 닫히는 ```a``` 가 코드 블록을 연 것으로 세져 그 뒤 정리가 꺼졌다
  it('한 줄 ```a``` 는 인라인 코드 — 다음 줄의 정리가 꺼지지 않고 진짜 코드 블록 안은 그대로', () => {
    expect(discordMarkdown('```a```\n<t:0> [t](https://evil)\n```\n<@1>\n```')).toBe(
      '```a```\n\\<t:0> t (https://evil)\n```\n<@1>\n```',
    );
  });

  // 회귀: #756 9-1 critical(2회차) — 코드 블록은 Discord 처럼 아무 위치의 ``` 첫 짝으로 자른다
  it('닫는 펜스 줄의 꼬리 · 줄 중간 펜스 · 인용 안 펜스에서도 정리가 꺼지지 않는다', () => {
    expect(discordMarkdown('```\nx\n``` <t:0> [t](https://evil)')).toBe('```\nx\n``` \\<t:0> t (https://evil)');
    expect(discordMarkdown('a ```\ncode\n```\n<t:0> [t](https://evil)')).toBe('a ```\ncode\n```\n\\<t:0> t (https://evil)');
    expect(discordMarkdown('```\nfoo ``` <t:0>\n```')).toBe('```\nfoo ``` \\<t:0>\n```');
    expect(discordMarkdown('>>> ```\n<t:0>\n```')).toBe('> ```\n<t:0>\n```');
  });

  it('코드 블록 바로 뒤 같은 줄 조각에는 줄 규칙(제목 · 표)을 걸지 않는다', () => {
    expect(discordMarkdown('```a``` #### 제목')).toBe('```a``` #### 제목');
  });

  it('`####` 뒤가 비면 빈 줄', () => {
    expect(discordMarkdown('#### ##')).toBe('');
  });

  // 회귀: #756 9-1 critical — 제목 정규식 역추적(8천 자 100 초)
  it('긴 줄도 빠르다 — 제목 · 가로줄 · 표 구분 · 링크 · 코드', () => {
    const pad = ' '.repeat(20000);
    const inputs = [`#### a${pad}b`, `- - -${pad}x`, `|${'-'.repeat(20000)}x`, `| a |\n${pad}x`, `[${'a'.repeat(20000)}](https://x`, `${'`'.repeat(5000)}a`, '```'.repeat(3000)];
    for (const s of inputs) {
      const t0 = Date.now();
      discordMarkdown(s);
      expect(Date.now() - t0).toBeLessThan(200);
    }
  });

  it('`####` 제목의 끝 `#` 는 공백 뒤일 때만 뗀다', () => {
    expect(discordMarkdown('#### C#')).toBe('**C#**');
    expect(discordMarkdown('#### 요약 ###')).toBe('**요약**');
  });

  // 회귀: #756 9-1 major — Discord 가 렌더하는 가짜 링크 꼴
  it('제목 붙은 링크 · 대문자 스킴은 펼치고 · 펼치지 못한 꼴은 `](` 를 끊는다', () => {
    expect(discordMarkdown('[t](https://x "title")')).toBe('t (https://x)');
    expect(discordMarkdown("[t](HTTPS://x 't')")).toBe('t (HTTPS://x)');
    expect(discordMarkdown('[a [b] c](https://x)')).toBe('[a [b] c]\\(https://x)');
    expect(discordMarkdown('[`x`](https://evil)')).toBe('[`x`]\\(https://evil)');
    expect(discordMarkdown('[a]b](https://evil)')).toBe('[a]b]\\(https://evil)');
  });

  // 회귀: #756 9-1 info — 맨 주소 끝의 `>` 를 꺾쇠로 잘못 먹지 않는다
  it('맨 주소 안의 `<` `>` 는 지키고 `<` 는 막는다', () => {
    expect(discordMarkdown('[t](https://a.b/<@1>)')).toBe('t (https://a.b/\\<@1>)');
  });

  // 회귀: #756 9-1 major — Discord 의 인라인 코드 판정(닫는 백틱 뒤에 백틱이 더 있으면 코드가 아니다)
  it('`<t:0>`` 는 코드가 아니다 — `<` 를 막는다', () => {
    expect(discordMarkdown('`<t:0>``')).toBe('`\\<t:0>``');
    expect(discordMarkdown('``a`b`` <x')).toBe('``a`b`` \\<x');
  });

  it('행이 없는 표는 머리 줄을 글로 남긴다', () => {
    expect(discordMarkdown('| a | b |\n|---|---|')).toBe('| a | b |');
  });

  it('CRLF 를 LF 로', () => {
    expect(discordMarkdown('a\r\nb\rc')).toBe('a\nb\nc');
  });
});
