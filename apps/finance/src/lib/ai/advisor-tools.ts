// pleiades#419: AI 호출이 받는 도구. 기본은 읽기뿐이고 쓰기는 호출부가 명시해야 받는다.
// 사람이 확인할 수 없는 호출(크론 · 파서 · 세션 없는 웹)이 외부 웹 본문을 읽으며 쓰기 권한을 갖지 않게 한다 —
// 프롬프트의 "사용자 확인 후 호출" 지시만으로는 막지 못한다. 봇 AI 대화는 쓰기를 받으므로 이 위험이 남는다(#419 기록).
// fit `src/lib/ai/advisor-tools.ts` 와 같은 방향이다.

const MCP_PREFIX = 'mcp__myfinance__'

const mcp = (names: readonly string[]): readonly string[] => names.map((name) => `${MCP_PREFIX}${name}`)

/** DB 원장을 바꾸지 않는 도구 + 웹 조회. `get_prices`·`get_watchlist` 는 시세 캐시(PriceCache)만 갱신한다. */
export const READ_TOOLS: readonly string[] = [
  ...mcp([
    'get_portfolio',
    'get_trades',
    'get_performance',
    'get_gift_tax_status',
    'get_dividends',
    'get_spending_summary',
    'simulate_growth',
    'get_prices',
    'get_fx_rate',
    'get_news',
    'get_disclosures',
    'get_technical_analysis',
    'get_holding_strategy',
    'get_all_strategies',
    'get_networth',
    'get_rsu_schedule',
    'get_stock_options',
    'get_watchlist',
    'get_transactions',
    'list_assets',
    'list_budgets',
    'list_recurring_transactions',
    'list_alert_configs',
    'list_alert_history',
    'list_custom_strategies',
  ]),
  'WebSearch',
  'WebFetch',
]

/** 원장·설정을 바꾸는 도구. `create_transaction` 은 외부 웹훅까지 간다. */
export const WRITE_TOOLS: readonly string[] = mcp([
  'set_holding_strategy',
  'add_watchlist',
  'update_watchlist',
  'delete_watchlist',
  'create_transaction',
  'update_transaction',
  'delete_transaction',
  'create_category',
  'update_category',
  'delete_category',
  'create_asset',
  'update_asset',
  'delete_asset',
  'create_asset_deposit',
  'set_budget',
  'delete_budget',
  'create_recurring_transaction',
  'update_recurring_transaction',
  'delete_recurring_transaction',
  'update_alert_config',
  'create_rsu_schedule',
  'update_rsu_schedule',
  'delete_rsu_schedule',
  'vest_rsu',
  'create_stock_option',
  'update_stock_option',
  'delete_stock_option',
  'create_stock_option_vesting',
  'update_stock_option_vesting',
  'delete_stock_option_vesting',
  'exercise_vesting',
  'create_custom_strategy',
  'update_custom_strategy',
  'delete_custom_strategy',
])

/** 쓰기를 받지 않는 호출의 시스템 프롬프트 끝에 붙인다 — 프롬프트 본문은 쓰기 도구를 안내하므로 없으면 "진행할까요?" 로 막다른 흐름이 된다. */
export const READ_ONLY_PROMPT_NOTICE = `

## 이번 호출의 권한
이번 호출은 읽기 전용이다. 위 목록의 생성·수정·삭제 도구는 쓸 수 없다. 데이터 변경 요청을 받으면 실행 확인을 묻지 말고, 봇 대화 또는 웹 화면에서 할 수 있다고 안내하라. 변경하지 않은 것을 변경했다고 말하지 마라.`

/**
 * CLI 도구 인자(escape 전). 쓰기를 받지 않는 호출은 허용 목록에서 빼고 `--disallowedTools` 로도 막는다 —
 * `dontAsk` 의 거부 동작 하나에만 기대지 않는다.
 */
export function advisorToolArgs(allowWriteTools: boolean): readonly string[] {
  if (allowWriteTools) {
    return ['--allowedTools', [...READ_TOOLS, ...WRITE_TOOLS].join(',')]
  }
  return ['--allowedTools', READ_TOOLS.join(','), '--disallowedTools', WRITE_TOOLS.join(',')]
}
