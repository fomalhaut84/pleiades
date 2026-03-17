/**
 * AI 질문 트리거 판별
 *
 * 한글 단어 경계를 고려한 패턴 매칭.
 * expense fallback과 AI fallback에서 공통 사용.
 */

/** 질문형 키워드 */
const QUESTION_KEYWORDS = [
  '분석', '비교', '추천', '설명', '요약',
  '어때', '어떻게', '얼마', '언제',
  '알려줘', '알려', '해줘',
]

/**
 * 한글 경계를 고려한 키워드 정규식 생성
 * - 앞: 시작 또는 공백/구두점
 * - 키워드
 * - 뒤: 끝 또는 공백/구두점/조사(을를이가은는도에서)
 *   단, 조사 뒤에 추가 글자가 있으면 매칭 안 함
 */
function buildKeywordRegex(keywords: string[]): RegExp {
  const escaped = keywords.map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  // 키워드 뒤: 끝, 공백/구두점, 또는 조사 1자 + (끝 또는 공백/구두점)
  const pattern = `(?:^|[\\s.,!?:;])(${escaped.join('|')})(?:[을를이가은는도에서](?=$|[\\s.,!?:;]))?(?=$|[\\s.,!?:;])`
  return new RegExp(pattern)
}

const KEYWORD_REGEX = buildKeywordRegex(QUESTION_KEYWORDS)

/**
 * 텍스트가 AI 질문인지 판별
 */
export function isAiQuestion(text: string): boolean {
  // ? 포함
  if (/[?？]/.test(text)) return true

  // 질문형 키워드 매칭 (한글 단어 경계)
  return KEYWORD_REGEX.test(text)
}
