# 013 r2 재감사 (reversibility-auditor · 2026-11-17) — 요약 기록

집계: **정정 3 · 확인 8**(미확인 2 는 r2 가 미확인으로 표기 — 모바일 inline 필드 · Q-2). r1 정정 13 모두 반영 확인. 결론: 셋을 고치면 정본으로 올려도 된다.

| # | 판정 | 요지 |
|---|---|---|
| 1 | 확인 | 발신 3항식 위치 · apps 직접 호출 0 · 파일 설명 경로는 escape 만 |
| 2 | 정정(작음) | `discord/reply.ts:77-83` 은 fin — fit 은 `bot/core/reply.ts:7` → `bot/discord/reply.ts:27` |
| 3 | 정정 | fit 기본값 해시가 바뀌면 두 경우 모두 행이 생긴다 — 손대지 않은 키 활성(:40) · 고친 키 초안(:41) |
| 4 | 확인 | 살아 있는 발신 정확히 3곳 · 같은 함수면 gateway 도 맞춰진다 |
| 5 | 확인 | `editWith` · `editOriginal` · `firstChunk` 모두 `toChunks` |
| 6 | 정정 | P2-d 는 Release 자동 배포(4b-5) · `packages/` 가 입력이라 P2-a 만으로도 통합 층 재배포 · advisor `bot.test.ts` |
| 7 | 확인 | P3-a 범위 목록 · `setButtons` 는 components 만 PATCH(embed 유지 — 원하는 동작) |
| 8 | 확인 | `<` 전부 escape 는 지금과 같은 출력 · 단 R8 이 전제 |
| 9 | 확인(단서) | `>>> ` → `> ` 는 이어지는 줄 인용이 풀린다 |
| 10 | 확인 | 버전 P1 patch · P2 · P3 minor · 서버 조치 없음 |
| 11 | 확인 | r1 반영 대장 ↔ 본문 일치 |
