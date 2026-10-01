# 매매 전략 스킬 연동

## 목적

stock-trading-method 매매 방법론을 AI 어드바이저에 연동.
종목 추천/분석 요청 시 6단계(종목 발굴→유동성→변동성→적정가→매수매도→하락장 대응)
체크리스트를 자동 적용.

## 요구사항

- [ ] 스킬 파일을 `.claude/rules/stock-trading-method.md`로 배치
- [ ] `claude -p` 실행 시 cwd rules로 자동 참조
- [ ] AI가 종목 관련 질문 시 스킬 프레임워크 적용 확인

## 기술 설계

### 변경 파일 (1개)

**`.claude/rules/stock-trading-method.md`** (신규) — 스킬 내용 배치

Claude Code CLI는 cwd의 `.claude/rules/*.md` 파일을 자동으로 컨텍스트에 포함한다.
서버에서 `claude -p`가 프로젝트 루트에서 실행되므로 자동 적용.

## 테스트 계획

- [ ] AI에게 "거래량 많은 종목 추천해줘" → 0단계 종목 발굴 프레임워크 적용
- [ ] AI에게 "SOXL 분석해줘" → 1~4단계 체크리스트 적용

## 제외 사항

- AI 코드 변경 없음
- 시스템 프롬프트 변경 없음
