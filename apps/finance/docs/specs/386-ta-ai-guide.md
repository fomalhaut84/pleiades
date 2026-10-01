# Phase 30-A — TA 시그널 AI 가이드 폴리시 (on/off + 쿨다운)

- **작성일**: 2026-07-01 (재조정: 실제 구현 상태 확인 후 폴리시 범위로 축소)
- **참조**: [385-milestone-12-master.md](./385-milestone-12-master.md), 11차 마스터 #370, 이슈 #230 (4)

## 1. 배경

`src/bot/notifications/ta-signal-alert.ts` 를 확인한 결과 **AI 가이드 첨부는 이미 구현됨** (line 226-250):
- `askAdvisor` 호출 (최대 3종목)
- stock-trading-method 프롬프트 기반 1-2줄 가이드
- 실패 시 fallback (시그널만 발송)
- HTML 포맷 + 300자 트림

즉 11차 29-C 는 실질적으로 완료 상태. 남은 폴리시:

1. 사용자가 AI 가이드를 끌 수 있는 스위치 (`AlertConfig.ta_ai_guide`)
2. 티커별 쿨다운 — 같은 티커 하루 여러 시그널 발생 시 반복 AI 호출 방지

## 2. 요구사항

- [ ] `AlertConfig.ta_ai_guide` = `'on'` / `'off'` — 봇 시작 시 upsert (`ensureTaAiGuideSetting`), 기본 `'on'`
- [ ] 봇 스케줄러 등록 시 자동 초기화 (기존 `ensureActiveReviewSetting` 패턴 재사용)
- [ ] `off` 시 `askAdvisor` 호출 자체를 skip → 시그널만 발송
- [ ] 티커별 쿨다운 6시간 — 프로세스 로컬 Map, 재시작 시 초기화 (허용)
- [ ] 쿨다운 중 티커는 AI 가이드 skip (시그널은 정상 발송)
- [ ] 알림 발송 성공한 경우에만 쿨다운 타임스탬프 기록 (실패 시 재시도 여지)

## 3. 기술 설계

### 파일 변경
- `src/bot/notifications/ta-signal-alert.ts` — 가이드 생성 loop 에 config + 쿨다운 가드
- `src/bot/notifications/scheduler.ts` — `ensureTaAiGuideSetting` 초기화

### 코드 스케치
```ts
// ta-signal-alert.ts
const TA_AI_GUIDE_KEY = 'ta_ai_guide'
const TA_AI_GUIDE_LABEL = 'TA 시그널 AI 가이드 (on/off)'
const AI_COOLDOWN_MS = 6 * 60 * 60 * 1000

const lastAiAskByTicker = new Map<string, number>()

export async function ensureTaAiGuideSetting(): Promise<void> {
  try {
    await prisma.alertConfig.upsert({
      where: { key: TA_AI_GUIDE_KEY },
      update: {},
      create: { key: TA_AI_GUIDE_KEY, value: 'on', label: TA_AI_GUIDE_LABEL },
    })
  } catch (error) {
    console.error('[ta-signal] ta_ai_guide 설정 초기화 실패:', error)
  }
}

async function isTaAiGuideEnabled(): Promise<boolean> {
  const config = await prisma.alertConfig.upsert({
    where: { key: TA_AI_GUIDE_KEY },
    update: {},
    create: { key: TA_AI_GUIDE_KEY, value: 'on', label: TA_AI_GUIDE_LABEL },
  })
  return config.value.toLowerCase() !== 'off'
}

function isTickerCooling(ticker: string, now: number): boolean {
  const last = lastAiAskByTicker.get(ticker) ?? 0
  return now - last < AI_COOLDOWN_MS
}

// doCheckTASignals 내부 가이드 생성 loop 앞에
const aiEnabled = await isTaAiGuideEnabled()
if (aiEnabled) {
  const now = Date.now()
  const guideTargets = results.slice(0, 3).filter((r) => !isTickerCooling(r.ticker, now))
  for (const r of guideTargets) {
    try {
      const guide = await askAdvisor(...)
      aiGuides.set(r.ticker, guide.response.trim())
      // 발송 성공 여부 확인 후 기록 (아래 sendSuccess 처리 확장)
    } catch (...) {}
  }
}

// 알림 발송 성공 시 쿨다운 기록도 함께
if (sendSuccess) {
  for (const [ticker] of aiGuides) {
    lastAiAskByTicker.set(ticker, Date.now())
  }
  // (기존 sentToday 기록 유지)
}
```

### 재사용
- `ensureActiveReviewSetting` 패턴 (동일 폴더 파일)
- 기존 `sendSuccess` 플래그로 dedup 기록 시점 정합

## 4. 테스트 계획

- [ ] 유닛: `isTickerCooling` 로직 (경계값 검증)
- [ ] 통합: `AlertConfig.ta_ai_guide = 'off'` 시 askAdvisor 호출 없음 (mock 확인)
- [ ] 통합: 쿨다운 이내 재호출 skip 확인
- [ ] lint / typecheck / build

## 5. 제외

- 프롬프트 커스터마이즈 (v2)
- 조언 이력 DB 저장 (메모리만)
- top-N 설정화 (현 하드코드 3 유지)

## 6. 완료 시

11차 마스터 이슈 #370 종료 (29-C 최종 마감 처리).
