// pleiades 009 D-4(#418): 모델 입력의 플랫폼 표기. 프롬프트는 공유되고 모델 출력은 변환되지 않으므로 Discord 에서 거짓인 안내를 두지 않는다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SYSTEM_PROMPT } from '../system-prompt'

const APP_ROOT = join(__dirname, '..', '..', '..', '..')

describe('SYSTEM_PROMPT 플랫폼 표기', () => {
  it('텔레그램을 말하지 않는다', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/텔레그램|telegram/i)
  })

  it('AI 대화 명령은 ! 표기다 — / 는 Discord 입력창이 가로챈다', () => {
    expect(SYSTEM_PROMPT).toContain('`!ai [질문]`')
    expect(SYSTEM_PROMPT).toContain('`!reset`')
    expect(SYSTEM_PROMPT).not.toMatch(/\/(ai|reset)\b/)
  })

  it('신뢰 범위 문장이 가리키는 절이 실제 제목으로 있다', () => {
    expect(SYSTEM_PROMPT).toContain('"봇 커맨드"')
    expect(SYSTEM_PROMPT).toMatch(/^## 봇 커맨드 /m)
  })
})

describe('앱 CLAUDE.md — CLI 가 cwd 에서 모델 입력으로 읽는다', () => {
  const doc = readFileSync(join(APP_ROOT, 'CLAUDE.md'), 'utf8')

  it('AI 세션 초기화를 / 로 안내하지 않는다', () => {
    expect(doc).not.toContain('/reset')
    expect(doc).toContain('!reset')
  })

  it('입력·알림을 텔레그램 중심으로 적지 않는다', () => {
    expect(doc).not.toContain('텔레그램 중심')
    expect(doc).not.toContain('텔레그램 대화 세션')
    expect(doc).not.toContain('텔레그램 chat별')
  })
})
