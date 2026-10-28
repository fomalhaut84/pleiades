/**
 * 중립 버튼 → Discord 액션 행. 한도(행 5 · 행당 5 · action 100자 · label 80자)를 넘으면 자르지 않고 던진다 —
 * 버튼을 잃으면 사용자가 할 일을 잃는다(notify `toDiscordComponents` 와 같은 원칙).
 */
import type { ButtonRows } from './types';

const MAX_ROWS = 5;
const MAX_PER_ROW = 5;
const MAX_ACTION = 100;
const MAX_LABEL = 80;

export interface DiscordComponentRow {
  type: 1;
  components: Array<{ type: 2; style: 2 | 5; label: string; custom_id?: string; url?: string }>;
}

export function toComponents(rows: ButtonRows): DiscordComponentRow[] {
  const nonEmpty = rows.filter((r) => r.length > 0);
  if (nonEmpty.length > MAX_ROWS) throw new Error(`@pleiades/chat: 버튼 행은 ${MAX_ROWS}개까지 (${nonEmpty.length})`);
  return nonEmpty.map((row) => {
    if (row.length > MAX_PER_ROW) throw new Error(`@pleiades/chat: 버튼은 행당 ${MAX_PER_ROW}개까지 (${row.length})`);
    return {
      type: 1,
      components: row.map((b) => {
        if (b.label === '' || b.label.length > MAX_LABEL) {
          throw new Error(`@pleiades/chat: 버튼 이름은 1~${MAX_LABEL}자 (${b.label.length})`);
        }
        const hasAction = typeof b.action === 'string';
        const hasUrl = typeof b.url === 'string';
        if (hasAction === hasUrl) throw new Error('@pleiades/chat: 버튼에는 action 과 url 중 하나만 둔다');
        if (hasAction) {
          const action = b.action as string;
          if (action === '' || action.length > MAX_ACTION) {
            throw new Error(`@pleiades/chat: 버튼 action 은 1~${MAX_ACTION}자 (${action.length})`);
          }
          return { type: 2 as const, style: 2 as const, label: b.label, custom_id: action };
        }
        if (!/^https?:\/\//i.test(b.url as string)) throw new Error('@pleiades/chat: 버튼 url 은 http(s) 만');
        return { type: 2 as const, style: 5 as const, label: b.label, url: b.url as string };
      }),
    };
  });
}
