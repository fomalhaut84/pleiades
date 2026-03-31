# 텔레그램 긴 메시지 마크다운 렌더링 수정

## 목적

4096자 초과 AI/브리핑 응답이 plain text로 전송되어 마크다운(`**볼드**`, `*이탤릭*` 등)이
렌더링되지 않고 원시 텍스트로 보이는 버그 수정.

## 원인

`ai.ts`, `briefing.ts`에서 HTML 변환 후 4096자 초과 시 `splitMessage`로 분할하지만,
분할된 chunk를 `parse_mode` 없이 plain text로 전송하고 있음.

## 요구사항

- [ ] 긴 AI 응답: chunk별 HTML 변환 + `parse_mode: 'HTML'`로 전송
- [ ] 긴 브리핑 응답: chunk별 HTML 변환 + `parse_mode: 'HTML'`로 전송
- [ ] HTML 전송 실패 시 plain text fallback 유지 (안전장치)
- [ ] 기존 4096자 이하 메시지 동작 회귀 없음

## 기술 설계

### 변경 파일 (2개)

1. **`src/bot/commands/ai.ts`** (L34-45)
   - `splitMessage` 후 각 chunk를 `markdownToTelegramHtml` 변환
   - `parse_mode: 'HTML'`로 전송, 실패 시 plain text fallback

2. **`src/bot/notifications/briefing.ts`** (L57-66)
   - 동일한 패턴 수정

## 테스트 계획

- [ ] 4096자 초과 AI 응답 → 볼드/이탤릭 정상 렌더링
- [ ] 4096자 이하 AI 응답 → 기존과 동일 동작
- [ ] 브리핑 메시지 → 정상 렌더링
- [ ] lint + typecheck + build 통과

## 제외 사항

- markdownToTelegramHtml 변환 로직 변경 없음
- splitMessage 분할 로직 변경 없음
