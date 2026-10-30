/**
 * pleiades 009 D-3 PR-2c (pleiades#396 · 9-1 리뷰 major) — `afterCommit`: 단계마다 따로 · 실패는 로그만.
 */

import { describe, expect, it, vi } from 'vitest'
import { afterCommit } from '../reply'

describe('afterCommit', () => {
  it('앞 단계가 실패해도 뒤 단계가 돈다 · 실패마다 로그 한 줄 · 던지지 않는다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const order: string[] = []
    await expect(afterCommit('[t]', [
      async () => { order.push('a'); throw new Error('a') },
      async () => { order.push('b') },
      async () => { order.push('c'); throw new Error('c') },
    ])).resolves.toBeUndefined()
    expect(order).toEqual(['a', 'b', 'c'])
    expect(error).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalledWith('[t] 기록 뒤 원본 수정 실패(기록은 됨):', expect.any(Error))
    error.mockRestore()
  })
})
