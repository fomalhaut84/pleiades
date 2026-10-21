# 17-E: 설정 통합 페이지 — 구현 계획

## 변경 파일

### 신규
- `prisma/migrations/xxx_whooing_config/` — WhooingConfig, WhooingCategoryMap 모델
- `src/app/api/settings/whooing/route.ts` — GET/PUT 웹훅 설정
- `src/app/api/settings/whooing/mappings/route.ts` — GET/PUT 카테고리 매핑
- `src/components/settings/AlertConfigEditor.tsx`
- `src/components/settings/IncomeProfileManager.tsx`
- `src/components/settings/IncomeProfileForm.tsx`
- `src/components/settings/WhooingSettings.tsx`

### 수정
- `prisma/schema.prisma` — WhooingConfig, WhooingCategoryMap 모델
- `src/app/settings/SettingsClient.tsx` — 나머지 탭 연결
- `src/lib/whooing-webhook.ts` — DB 기반 설정으로 전환

## 구현 순서
1. WhooingConfig/WhooingCategoryMap 스키마 + 마이그레이션
2. AlertConfigEditor (기존 API 활용)
3. IncomeProfileManager + Form (기존 API 활용)
4. WhooingSettings + API
5. whooing-webhook.ts DB 기반 전환
6. SettingsClient 탭 연결
