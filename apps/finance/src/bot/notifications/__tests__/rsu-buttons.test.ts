import { toDiscordComponents } from '@pleiades/notify'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { buildVestButtons } from '../rsu'

// 회귀: 009 D-5 A4 — grammY 를 떼어도 Discord 페이로드는 옛 InlineKeyboard 때와 같다(옛 메시지 클릭도 그대로)
describe('buildVestButtons', () => {
  it('custom_id 와 라벨이 그대로다', () => {
    expect(toDiscordComponents(buildVestButtons('r1'))).toEqual([
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: '✅ 확정', custom_id: 'vest:confirm:r1' },
          { type: 2, style: 2, label: '✖️ 취소', custom_id: 'vest:cancel:r1' },
        ],
      },
    ])
  })
})
