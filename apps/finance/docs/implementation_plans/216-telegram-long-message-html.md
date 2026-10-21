# 구현 계획: 텔레그램 긴 메시지 마크다운 렌더링 수정 (#216)

## 변경 파일 (2개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/bot/commands/ai.ts` | splitMessage chunk별 HTML 변환 + parse_mode 적용 |
| 2 | `src/bot/notifications/briefing.ts` | 동일 패턴 수정 |

## 구현 내용

각 chunk를 `markdownToTelegramHtml()`로 변환 후 `parse_mode: 'HTML'`로 전송.
chunk별 try-catch로 HTML 실패 시 plain text fallback.

## 패키지 추가: 없음
## DB 마이그레이션: 없음
