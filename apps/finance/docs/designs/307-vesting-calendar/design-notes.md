# 베스팅 캘린더 디자인 노트

## 컬러
- RSU: `--sejin` (#34d399 다크 / #059669 라이트)
- 스톡옵션: `--sodam` (#60a5fa 다크 / #2563eb 라이트)
- 오늘 셀: `--amber` 톤 (배경 ring inset)
- 일요일: red-400 텍스트 (기존 캘린더 관습)
- expired/exercised: 회색/opacity-50

## 레이아웃
1. **헤더 (sticky)**: 페이지 제목 + 테마 토글
2. **요약 strip** (4 카드): 이번 달 / 다가오는 90일 / YTD 완료 / 만료 임박
3. **캘린더 카드**: 월 라벨 + 네비 + 7x6 그리드 + 레전드
4. **하단 2단**: 다가오는 90일 리스트 + (계좌별 분포 + 면책 박스)

## 셀 디자인
- min-height 88px (모바일) / 104px (데스크탑)
- 헤더: 날짜 숫자 + 이벤트 개수 (>1)
- 바: 최대 3개, 초과 시 `+N`
- 호버: `bg-surface`
- 오늘: amber ring + 옅은 amber 배경
- 인접월 셀: `opacity 0.35`

## 이벤트 바
- 크기: 9.5px font, 1px/6px padding
- 형식: `[✓] 1.2K` (마커 + 단축 수량)
- 클릭 시 RSU/스톡옵션 페이지로 점프 (현재는 # 링크)

## 상태별 시각
| status | marker | opacity |
|---|---|---|
| pending | 없음 | 1.0 |
| vested | ✓ | 1.0 |
| exercisable | ✓ | 1.0 |
| exercised | ✓ | 0.5 |
| expired | ✗ | 회색 배경 |

## 다가오는 90일 리스트
- 좌측 컬러 액센트 바 (3px)
- 날짜 라벨 + D-N 카운터
- 종목 라벨 (RSU/OPT 뱃지 + 이름)
- 메타 (계좌 · 수량 · 행사가)
- 우측 상태 뱃지 (있을 경우)

## 모바일 (375px) 적응
- 캘린더 셀 폰트 작아짐, 이벤트 바 일부만 노출
- 다가오는 리스트가 모바일 1차 정보원

## light/dark 토글
- CSS 변수로 모든 색상 토큰화
- Tailwind utility (amber-50 등) 도 `dark:` prefix 또는 CSS 변수 mix 활용
- 다크 기본 + light 토글 즉시 반영

## 구현 시 참고
- React 변환 시 `useState(cursor)` + `useMemo(grid)` 로 충분
- 이벤트 클릭 시 next/link 의 `<Link>`
- 헤더 sticky 는 layout 의 header 가 있으므로 생략 가능
- 데이터는 server component 에서 fetch → client component 에 prop 전달
