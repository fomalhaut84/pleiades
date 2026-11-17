// 013 P2-b (#758) — 분기 PDF AI 코멘트: 마크다운 서식 기호만 걷어낸다
import { describe, expect, it } from 'vitest'
import { markdownToPdfText } from '../pdf-text'

describe('markdownToPdfText', () => {
  it('제목 · 굵게 · 목록 · 인용 · 가로줄 · 인라인 코드 · 링크', () => {
    const md = ['## 1. 분기 성과 총평', '**잘한 점**', '- AAPL +12%', '  * 하위 항목', '> 참고', '---', '`TWR` 기준', '[공시](https://dart.fss.or.kr/x)'].join('\n')
    expect(markdownToPdfText(md)).toBe(
      ['1. 분기 성과 총평', '잘한 점', '• AAPL +12%', '  • 하위 항목', '참고', '', 'TWR 기준', '공시 (https://dart.fss.or.kr/x)'].join('\n'),
    )
  })

  it('곱셈 · 단독 별표 · 번호 목록은 건드리지 않는다', () => {
    expect(markdownToPdfText('3 * 4 = 12\n1. 첫째\n*주의')).toBe('3 * 4 = 12\n1. 첫째\n*주의')
  })

  // 회귀: #758 9-1 info — 인용 안 제목 · 취소선 · escape · 코드 안 굵게
  it('인용 안 제목 · 취소선 · escape 기호 · 인라인 코드 안은 그대로', () => {
    expect(markdownToPdfText('> ## 요약\n~~취소~~ \\*별\\*\n`**코드**` **굵게**')).toBe('요약\n취소 *별*\n**코드** 굵게')
  })

  it('~~~ 펜스도 코드 블록', () => {
    expect(markdownToPdfText('~~~\n## 그대로\n~~~')).toBe('## 그대로')
  })

  it('코드 블록은 펜스만 빼고 안은 그대로', () => {
    expect(markdownToPdfText('```\n## 그대로\n```')).toBe('## 그대로')
  })
})
