# [Phase 24-D] vest_rsu 자동화 — A(vestPrice 자동조회) + C(MCP 도구)

- **작성일**: 2026-06-30
- **타입**: feature (P2)
- **참조**: `memory/project_24d_vest_rsu_plan.md` (6차 마일스톤 보류 항목)

## 1. 배경

기존 RSU 베스팅 처리 흐름:
1. 봇 cron 이 매일 09:00 KST D-7/D-1 텍스트 알림만 발송
2. 사용자가 웹 `/rsu` 페이지 들어가서 카드 클릭
3. `vestPrice` (베스팅일 종가) + `autoSell` 직접 입력
4. `POST /api/rsu/[id]/vest` 호출 → BUY/SELL Trade + Holding 자동 처리

문제: 2~3단계가 매번 수동. vestPrice 도 사용자가 yahoo 가서 직접 확인 → 입력.

## 2. 목표

D-day 알림에 인라인 키보드 한 번 탭으로 처리 완료:
```
🎯 RSU 베스팅 준비됨 (오늘)
종목: 카카오 035720.KS
계좌: 세진
수량: 135주 (매도 70주 + 보유 65주)
종가 (자동조회): ₩52,400
autoSell: ✓

[✅ 확정] [✖️ 취소]
```

AI 어드바이저 자연어로도:
```
사용자: "오늘 카카오 RSU 베스팅 처리해줘"
AI: → vest_rsu(account_name='세진') 호출 → 자동 종가 조회 + vest
```

## 3. 비채택: B(cron 완전 자동)

사용자 동의 없이 Trade 자동 생성은 잘못 시 복구 어려움 + 프로젝트 정책 "쓰기는 사용자 확인 후" 와 충돌. **인라인 키보드 한 번 탭** 이 수동/자동 균형점.

## 4. 요구사항

### A. vestPrice 자동 조회

- [ ] **A1**: `GET /api/rsu/[id]/vest-preview` 신규 — RSU 스케줄 정보 + 베스팅일 종가 (yahoo finance) + autoSell 기본값 반환
  - 베스팅일 ≤ 오늘 → yahoo historical (해당일 종가)
  - 베스팅일 > 오늘 → 현재가 (현재 시점 기준 미리보기, 실제 처리는 베스팅일 도래 후)
  - 종가 fetch 실패 시 200 with `vestPrice: null` (사용자가 수동 입력)
- [ ] **A2**: 단위 테스트 — vest-preview 응답 shape, null fallback

### 봇 인라인 키보드

- [ ] **B1**: `src/bot/notifications/rsu.ts` — D-1 알림에 `[✅ 확정] [✖️ 취소]` inline keyboard 추가 (D-7 은 정보성만)
  - `callback_data`: `vest:confirm:<rsuId>` / `vest:cancel:<rsuId>`
  - 메시지에 `vest-preview` 결과 (종가 자동조회) 포함
- [ ] **B2**: `src/bot/commands/vest-confirm.ts` 신규 — callback_query 핸들러
  - confirm → `vest-preview` 재호출 (최신 종가) → `POST /api/rsu/[id]/vest` → 처리 결과 reply
  - cancel → 알림 메시지 텍스트 갱신 ("취소됨")
  - 중복 클릭 차단 (already_vested 상태 가드)

### C. MCP vest_rsu 도구

- [ ] **C1**: `src/mcp/tools/rsu-vest.ts` 신규 — `vest_rsu` 도구
  - 입력: `id` (RSU 스케줄 ID, 필수) + `autoSell` (선택, 기본 schedule.sellShares > 0 이면 true)
  - 동작: `vest-preview` 조회 → `vest` 라우트 호출 → 결과 반환
- [ ] **C2**: 등록 3곳 동시 update:
  - `src/mcp/server.ts` (tool 등록)
  - `src/lib/ai/claude-advisor.ts` ALLOWED_TOOLS
  - `src/lib/ai/system-prompt.ts` (도구 설명 + 쓰기 정책)

## 5. 기술 설계

### 5.1 종가 조회 헬퍼

신규 `src/lib/rsu-vest-preview.ts`:
```ts
import yahooFinance from 'yahoo-finance2'
import { prisma } from './prisma'

export interface VestPreview {
  schedule: { id, accountName, vestingDate, shares, sellShares, ... }
  vestPrice: number | null
  vestPriceSource: 'historical' | 'current' | 'fallback'
  autoSellDefault: boolean
  ticker: string  // '035720.KS' 고정
}

export async function getVestPreview(id: string): Promise<VestPreview | null> {
  const schedule = await prisma.rSUSchedule.findUnique({ where: { id }, include: { account: ... } })
  if (!schedule) return null
  if (schedule.status !== 'pending') return null  // already vested 차단

  let vestPrice: number | null = null
  let source: 'historical' | 'current' | 'fallback' = 'fallback'
  try {
    const todayMs = Date.now()
    const isFuture = schedule.vestingDate.getTime() > todayMs
    if (isFuture) {
      // 현재가 (미리보기)
      const q = await yahooFinance.quote('035720.KS')
      vestPrice = q.regularMarketPrice ?? null
      source = 'current'
    } else {
      // historical (실제 처리용)
      const date = schedule.vestingDate
      const chart = await yahooFinance.chart('035720.KS', {
        period1: date, period2: new Date(date.getTime() + 86400000),
        interval: '1d',
      })
      const close = chart.quotes[0]?.close
      vestPrice = close ?? null
      source = 'historical'
    }
  } catch (err) {
    console.error('[vest-preview] price fetch 실패:', err)
  }

  return {
    schedule: { id, accountName: schedule.account.name, ... },
    vestPrice,
    vestPriceSource: source,
    autoSellDefault: (schedule.sellShares ?? 0) > 0,
    ticker: '035720.KS',
  }
}
```

### 5.2 callback_query 핸들러

```ts
// src/bot/commands/vest-confirm.ts
export function registerVestConfirmHandler(bot: Bot) {
  bot.callbackQuery(/^vest:(confirm|cancel):(.+)$/, async (ctx) => {
    const [, action, rsuId] = ctx.match!
    if (action === 'cancel') {
      await ctx.editMessageText('베스팅 처리 취소됨.')
      await ctx.answerCallbackQuery('취소')
      return
    }
    // confirm
    const preview = await getVestPreview(rsuId)
    if (!preview || preview.vestPrice == null) {
      await ctx.answerCallbackQuery({ text: '종가 조회 실패. 웹 페이지에서 직접 처리해주세요.', show_alert: true })
      return
    }
    // vest 라우트 호출
    const result = await processVest(rsuId, preview.vestPrice, preview.autoSellDefault)
    await ctx.editMessageText(`✅ 베스팅 처리 완료\n${result.summary}`)
    await ctx.answerCallbackQuery('완료')
  })
}
```

처리는 직접 prisma 호출 (HTTP 우회) — 봇은 standalone process 라 next 서버 wake up 비용 없음.

### 5.3 MCP 도구

```ts
// src/mcp/tools/rsu-vest.ts
export const vestRsuTool = {
  name: 'vest_rsu',
  description: 'RSU 베스팅 처리 — 종가 자동 조회 후 vest. 사용자 확인 후 호출.',
  inputSchema: z.object({
    id: z.string().describe('RSU 스케줄 ID'),
    autoSell: z.boolean().optional().describe('매도 자동 실행 (미지정 시 schedule.sellShares > 0 기본)'),
  }),
  handler: async ({ id, autoSell }) => {
    const preview = await getVestPreview(id)
    if (!preview) throw new Error('RSU 스케줄을 찾을 수 없거나 이미 처리됨')
    if (preview.vestPrice == null) throw new Error('종가 조회 실패 — 베스팅일이 오늘/과거인지 확인')
    return await processVest(id, preview.vestPrice, autoSell ?? preview.autoSellDefault)
  },
}
```

## 6. 변경 파일

- `src/lib/rsu-vest-preview.ts` 신규
- `src/lib/__tests__/rsu-vest-preview.test.ts` 신규
- `src/app/api/rsu/[id]/vest-preview/route.ts` 신규 (GET)
- `src/bot/notifications/rsu.ts` (D-1 알림에 inline keyboard + vest-preview 결과 포함)
- `src/bot/commands/vest-confirm.ts` 신규 (callback_query)
- `src/bot/index.ts` (registerVestConfirmHandler 등록)
- `src/mcp/tools/rsu-vest.ts` 신규
- `src/mcp/server.ts` (도구 등록)
- `src/lib/ai/claude-advisor.ts` ALLOWED_TOOLS
- `src/lib/ai/system-prompt.ts`

## 7. 테스트

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- vest-preview 단위 테스트
- 수동 회귀: 봇 D-1 알림 → 인라인 키보드 클릭 → 처리 확인. AI "이번 RSU 베스팅 처리" 명령

## 8. 배포 가이드

- 배포 후 텔레그램 `/reset` 필수 (MCP 도구 변경 → 세션 재시작) — `memory/project_ai_session_resume.md`
- D-1 알림은 매일 09:00 KST 자동, 처음 베스팅일이 가까이 있어야 검증 가능

## 9. 제외 사항

- B (cron 완전 자동 vest) — 패스 결정
- 옵션 (StockOption) 행사 자동화 — RSU 와 별개 흐름, 별도 phase
- 다중 회사 RSU 지원 — `RSU_TICKER` 카카오 고정 유지
