import { describe, expect, it } from 'vitest';
import { decodeEntities, escapeDiscordMarkdown, htmlToDiscordMarkdown } from './discord-md';

describe('escapeDiscordMarkdown — 서식 주입 방지 (003 §7-1 정정 6-A)', () => {
  it('인라인 메타문자 \\ * _ ~ ` | [ ] 를 escape 한다', () => {
    expect(escapeDiscordMarkdown('a*b_c~d`e|f[g]h\\i')).toBe('a\\*b\\_c\\~d\\`e\\|f\\[g\\]h\\\\i');
  });

  it('사용자 입력 전략명의 별표·밑줄이 서식이 되지 않는다', () => {
    expect(escapeDiscordMarkdown('**급등** __전략__')).toBe('\\*\\*급등\\*\\* \\_\\_전략\\_\\_');
  });

  it('줄 머리의 > # - + 1. 만 escape 한다 — 줄 중간은 그대로', () => {
    expect(escapeDiscordMarkdown('> 인용\n# 제목\n- 목록\n+ 목록\n1. 번호\nRSI > 70 - 5 # 3')).toBe(
      '\\> 인용\n\\# 제목\n\\- 목록\n\\+ 목록\n1\\. 번호\nRSI > 70 - 5 # 3',
    );
  });

  it('괄호는 그대로 둔다 — 대괄호를 막아 마스크 링크가 생기지 않는다', () => {
    expect(escapeDiscordMarkdown('[클릭](https://x.y) (목표 100)')).toBe('\\[클릭\\](https://x.y) (목표 100)');
  });
});

describe('decodeEntities', () => {
  it('이름 · 10진 · 16진 엔티티', () => {
    expect(decodeEntities('A &amp; B &lt;100&gt; &quot;x&quot; &#39;y&#39; &#x1F4C8;')).toBe(`A & B <100> "x" 'y' 📈`);
  });

  it('모르는 엔티티 · 범위 밖 코드는 그대로', () => {
    expect(decodeEntities('&nbsp; &#0; &#x110000;')).toBe('&nbsp; &#0; &#x110000;');
  });
});

describe('htmlToDiscordMarkdown', () => {
  it('굵게 · 기울임 · 밑줄 · 취소선 · 스포일러', () => {
    expect(htmlToDiscordMarkdown('<b>B</b> <strong>S</strong> <i>I</i> <em>E</em> <u>U</u> <s>X</s> <del>D</del> <tg-spoiler>P</tg-spoiler>')).toBe(
      '**B** **S** *I* *E* __U__ ~~X~~ ~~D~~ ||P||',
    );
    expect(htmlToDiscordMarkdown('<span class="tg-spoiler">숨김</span>')).toBe('||숨김||');
  });

  it('텍스트 노드는 엔티티 디코드 후 escape 한다 — escapeHtml 된 사용자 입력', () => {
    expect(htmlToDiscordMarkdown('🎯 <b>A &amp; B_C</b> (SOXL &lt; 40)')).toBe('🎯 **A & B\\_C** (SOXL < 40)');
  });

  it('code 는 escape 하지 않고 디코드만 · 백틱이 있으면 울타리를 늘린다', () => {
    expect(htmlToDiscordMarkdown('<code>a_b &lt;c&gt;</code>')).toBe('`a_b <c>`');
    expect(htmlToDiscordMarkdown('<code>x`y</code>')).toBe('``x`y``');
    expect(htmlToDiscordMarkdown('<code>`x</code>')).toBe('`` `x ``');
  });

  it('pre 는 코드 블록 · language- 클래스는 언어로', () => {
    expect(htmlToDiscordMarkdown('<pre>line1\n*x*\n</pre>')).toBe('```\nline1\n*x*\n```');
    expect(htmlToDiscordMarkdown('<pre><code class="language-ts">const a = 1;</code></pre>')).toBe('```ts\nconst a = 1;\n```');
  });

  it('pre 본문의 ``` 는 블록을 닫지 못하게 끊는다', () => {
    expect(htmlToDiscordMarkdown('<pre>a```b</pre>')).toBe('```\na`​``b\n```');
  });

  it('링크 — http(s) 만 · 괄호·공백은 인코딩 · 라벨이 비면 URL', () => {
    expect(htmlToDiscordMarkdown('<a href="https://x.y/a(b)">보기</a>')).toBe('[보기](https://x.y/a%28b%29)');
    expect(htmlToDiscordMarkdown("<a href='https://x.y'></a>")).toBe('https://x.y');
    expect(htmlToDiscordMarkdown('<a href="javascript:alert(1)">x</a>')).toBe('x');
    expect(htmlToDiscordMarkdown('<a>x</a>')).toBe('x');
  });

  it('blockquote 는 줄마다 > 를 붙인다', () => {
    expect(htmlToDiscordMarkdown('<blockquote>a\nb</blockquote>끝')).toBe('> a\n> b\n끝');
  });

  it('중첩 서식', () => {
    expect(htmlToDiscordMarkdown('<b>굵게 <i>기울임</i></b>')).toBe('**굵게 *기울임***');
  });

  it('빈 서식 태그는 기호를 남기지 않는다', () => {
    expect(htmlToDiscordMarkdown('a<b></b>b')).toBe('ab');
  });

  it('모르는 태그는 벗기고 안쪽만 · br 은 줄바꿈', () => {
    expect(htmlToDiscordMarkdown('<div>x<br>y<br/>z</div>')).toBe('x\ny\nz');
  });

  it('관대한 파싱 — 짝 없는 닫는 태그는 버리고 열린 태그는 끝에서 닫는다', () => {
    expect(htmlToDiscordMarkdown('a</b>c')).toBe('ac');
    expect(htmlToDiscordMarkdown('<b>열림')).toBe('**열림**');
    expect(htmlToDiscordMarkdown('<b>x<i>y</b>z')).toBe('**x*y***z');
  });

  it('태그가 아닌 < 는 텍스트로 남는다', () => {
    expect(htmlToDiscordMarkdown('3 < 5 그리고 <3')).toBe('3 < 5 그리고 <3');
  });

  it('fin 실사용 형태 — 리포트 머리 + 목록', () => {
    const src = '📊 <b>일일 요약</b>\n\n- 총액: 1,000원\n<i>※ 참고용</i>';
    expect(htmlToDiscordMarkdown(src)).toBe('📊 **일일 요약**\n\n\\- 총액: 1,000원\n*※ 참고용*');
  });
});
