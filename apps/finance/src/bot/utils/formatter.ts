const ACCOUNT_EMOJI: Record<string, string> = {
  세진: '💼',
  소담: '👧',
  다솜: '👶',
}

export function accountEmoji(name: string): string {
  return ACCOUNT_EMOJI[name] ?? '📁'
}

export function formatKRWCompact(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_0000_0000) {
    return `${sign}₩${(abs / 1_0000_0000).toFixed(1)}억`
  }
  if (abs >= 1_0000) {
    return `${sign}₩${Math.round(abs / 1_0000).toLocaleString('ko-KR')}만`
  }
  return `${sign}₩${Math.round(abs).toLocaleString('ko-KR')}`
}

export function formatKRWFull(amount: number): string {
  return `₩${Math.round(amount).toLocaleString('ko-KR')}`
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

export function formatSignedKRW(amount: number): string {
  const sign = amount >= 0 ? '+' : ''
  return `${sign}₩${Math.round(amount).toLocaleString('ko-KR')}`
}

export function profitEmoji(returnPct: number): string {
  return returnPct >= 0 ? '🟢' : '🔴'
}

export function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`
}

const TELEGRAM_MAX_LENGTH = 4096

export function splitMessage(text: string, maxLength = TELEGRAM_MAX_LENGTH): string[] {
  if (text.length <= maxLength) return [text]

  const lines = text.split('\n')
  const chunks: string[] = []
  let current = ''

  for (const line of lines) {
    if (line.length > maxLength) {
      if (current) chunks.push(current)
      for (let i = 0; i < line.length; i += maxLength) {
        chunks.push(line.slice(i, i + maxLength))
      }
      current = ''
      continue
    }
    if (current.length + line.length + 1 > maxLength) {
      if (current) chunks.push(current)
      current = line
    } else {
      current = current ? `${current}\n${line}` : line
    }
  }
  if (current) chunks.push(current)

  return chunks
}
