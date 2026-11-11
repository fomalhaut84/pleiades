// pleiades#588: Recharts ResponsiveContainer 의 SSR 크기 경고 제거.
//
// 너비·높이가 모두 퍼센트인 ResponsiveContainer 는 첫 렌더(서버 SSR · 클라이언트 측정 전)에
// initialDimension(기본 -1×-1)을 크기로 쓰고, Recharts 는 둘 다 0 이하면 운영 빌드에서도
// `width(-1) and height(-1) of chart should be greater than 0` 을 console.warn 한다(웹 stderr).
//
// 높이만 양수로 주면 경고 조건(너비 또는 높이 > 0)이 풀린다. 너비는 -1 그대로라
// Recharts 는 지금처럼 측정 전에는 차트를 그리지 않고(null) 측정 뒤 실제 크기로 그린다 —
// 화면·하이드레이션 결과는 바뀌지 않는다.
export const CHART_INITIAL_DIMENSION = { width: -1, height: 1 } as const;
