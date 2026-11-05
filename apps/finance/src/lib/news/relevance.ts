/**
 * pleiades#280 — 제목에 대상 이름이 있는지 본다. `카카오` 결과에 계열사(카카오뱅크 · 카카오페이)가 섞이므로
 * 단순 포함이 아니라 이름 뒤가 끝 · 비문자 · 조사일 때만 같은 회사로 본다.
 */

/** 이름에 이어지면 다른 낱말이 되는 글자. 한자는 넣지 않는다 — `美삼성전자` · `삼성전자株` 는 같은 회사다 */
const WORD_CHAR = /[\p{Script=Hangul}\p{Script=Latin}\p{N}]/u
const PARTICLES = [
  '으로부터', '에서는', '에서도', '으로는', '으로도', '까지도', '부터는',
  '에서', '에게', '에는', '에도', '에선', '으로', '로는', '로도', '보다', '처럼', '까지', '부터', '마저', '조차',
  '와의', '과의', '이다', '였다', '이며', '대비',
  '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '로', '만', '다', '라', '인', '측', '발',
]

function boundaryAfter(rest: string): boolean {
  if (rest === '' || !WORD_CHAR.test(rest[0])) return true
  return PARTICLES.some((particle) => {
    if (!rest.startsWith(particle)) return false
    const next = rest.slice(particle.length)
    return next === '' || !WORD_CHAR.test(next[0])
  })
}

function hasWord(title: string, word: string): boolean {
  let from = 0
  for (;;) {
    const at = title.indexOf(word, from)
    if (at < 0) return false
    const before = at === 0 ? '' : title[at - 1]
    if ((before === '' || !WORD_CHAR.test(before)) && boundaryAfter(title.slice(at + word.length))) return true
    from = at + 1
  }
}

/** names 중 하나라도 제목에 독립된 낱말로 있으면 true (대소문자 무시). pure */
export function titleMentions(title: string, names: readonly string[]): boolean {
  // 위치와 경계를 같은 문자열에서 본다 — 소문자로 바꾸면 길이가 달라지는 글자가 있다
  const lower = title.toLowerCase()
  return names.some((name) => name !== '' && hasWord(lower, name.toLowerCase()))
}

const MIN_TICKER_WORD_LENGTH = 3

/**
 * 이름 또는 티커가 제목에 있으면 true. pure
 * 티커는 대소문자를 가린다(`All stocks rise` ≠ ALL). 2글자 이하(ON · KO)는 일반 낱말과 겹쳐 대조하지 않는다.
 */
export function mentionsTarget(title: string, names: readonly string[], ticker?: string): boolean {
  if (titleMentions(title, names)) return true
  return ticker !== undefined && ticker.length >= MIN_TICKER_WORD_LENGTH && hasWord(title, ticker)
}

/** Yahoo 회사명에서 앞 관사와 법인 접미사를 뗀다 — 제목은 `Apple` 이지 `Apple Inc.` 가 아니다. pure */
export function companyCoreName(name: string): string {
  return name
    .split(',')[0]
    .replace(/^the\s+/i, '')
    .replace(/\.com\b/gi, ' ')
    .replace(/\b(incorporated|corporation|company|limited|inc|corp|ltd|plc|co|usa)\b\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
