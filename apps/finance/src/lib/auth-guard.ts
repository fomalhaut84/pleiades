// PIN 로그인 판단 함수 — auth.ts 의 authorize 가 쓴다(#701).
// auth.ts 는 middleware(edge 런타임)에도 번들된다 — node:crypto 를 쓰지 않는다(next build 가 거부한다).

/**
 * 실패 횟수 제한 키 — 요청자가 고를 수 없는 값만 쓴다.
 * ① x-real-ip: nginx 가 `$remote_addr` 로 **덮어쓴다**(deploy/nginx/myfinance.conf)
 * ② 없으면 x-forwarded-for 의 **마지막** 값 — `$proxy_add_x_forwarded_for` 는 요청자가 보낸 값 뒤에 실제 주소를 붙이므로
 *    첫 값은 요청자가 정할 수 있다(옛 키 · 값을 바꿔 가며 5분 5회 제한을 피할 수 있었다)
 * ③ 둘 다 없으면 'unknown' — 사실상 나오지 않는다(Next.js 가 x-forwarded-for 가 없으면 소켓 주소로 채운다 ·
 *    base-server `??=`). 운영 전제: nginx 가 X-Real-IP 를 덮어쓰고 앱 포트가 외부에 닫혀 있다(아니면 헤더를 위조할 수 있다)
 */
export function clientKey(headers: Headers): string {
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real
  const last = headers.get('x-forwarded-for')?.split(',').map((v) => v.trim()).filter(Boolean).at(-1)
  return last || 'unknown'
}

const encoder = new TextEncoder()

/**
 * PIN 비교 — 앞자리가 맞는 정도로 시간이 달라지지 않게, 언제나 PIN 길이만큼 돌며 XOR 을 모은다(조기 반환 없음).
 * 길이 차이도 결과에만 섞는다. 비교 루프는 입력 길이와 무관하게 PIN 길이만큼만 돈다(인코딩은 입력 전체).
 */
export function pinMatches(input: unknown, pin: string): boolean {
  if (typeof input !== 'string' || input === '' || pin === '') return false
  const a = encoder.encode(input)
  const b = encoder.encode(pin)
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]
  return diff === 0
}
