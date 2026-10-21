# [Security] Dependabot 4건 패치 — dompurify/esbuild/js-yaml/postcss

## 목적

GitHub Dependabot 에 누적된 4건의 보안 취약점 해결.

## 알림 목록

| # | 패키지 | 현재 | 수정 | 심각도 | 요약 |
|---|---|---|---|---|---|
| 74 | dompurify | 3.4.9 | 3.4.11 | medium | `ALLOWED_ATTR` 영구 오염 (hook clone-guard 우회) |
| 73 | js-yaml | 4.1.1 | 4.2.0 | medium | merge key alias 반복 → quadratic DoS |
| 70 | esbuild | 0.27.4 | 0.28.1 | low | Windows dev server 임의 파일 읽기 (서버는 Ubuntu — 영향 없음) |
| 62 | postcss | 8.4.31 (transitive) | 8.5.10+ | medium | CSS Stringify `</style>` 미이스케이프 XSS |

## 패키지 의존 트리 (npm ls)

- `dompurify@3.4.9` — 직접 의존 (`^3.3.3` → `^3.4.11` 로 bump)
- `esbuild@0.27.4` — 직접 devDependency (`^0.27.4` → `^0.28.1` 로 bump)
- `js-yaml@4.1.1` — `eslint@8.57.1` 의 transitive (eslint 8 EOL — overrides 로 강제 4.2.0)
- `postcss@8.5.15` (top-level safe) + `postcss@8.4.31` (next 15.5.19 transitive — overrides 로 강제)

## 변경

### package.json
```json
{
  "dependencies": {
    "dompurify": "^3.4.11"
  },
  "devDependencies": {
    "esbuild": "^0.28.1"
  },
  "overrides": {
    "js-yaml": "^4.2.0",
    "postcss": "^8.5.10"
  }
}
```

### 검증
- `npm install`
- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- `npm audit` 으로 잔여 취약점 확인
- esbuild 0.27 → 0.28 minor bump — MCP/Bot 번들 정상 생성 확인

## 위험도

- dompurify: minor patch — API 호환
- esbuild: 0.27 → 0.28 (minor, 일부 breaking 가능성) — 빌드 명령 정상 동작 확인 필수
- js-yaml: minor (4.1 → 4.2) — eslint 가 사용. eslint 동작 확인
- postcss: patch 영역 (8.4 → 8.5) — Tailwind/Next 빌드 정상 확인

## 제외 사항

- 코드 수정 없음 (의존성만)
- 신규 기능 없음
