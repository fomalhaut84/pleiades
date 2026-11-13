// 모델 답(마크다운) → chat 의 html 부분집합 (#686).
// **먼저 HTML 이스케이프**한 뒤 바꾼다 — 답에 `<`·`&` 가 있어도 태그로 해석되지 않는다
// (fit `bot/utils/html.ts` mdToHtml 은 이스케이프 없이 바꾼다 — 여기서는 순서를 고정한다). chat 이 Discord 마크다운으로 다시 바꾸고
// 멘션은 chat rest 가 무력화한다(allowed_mentions). 순서: 목록 → 코드 스팬(안은 그대로) → 제목·굵게 → 기울임(9-1 info 5).
import { escapeHtml } from "@pleiades/notify";

function inline(s: string): string {
  return s
    .replace(/^#{1,3} (.+)$/gm, "<b>$1</b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<i>$2</i>");
}

export function answerToHtml(md: string): string {
  const listed = escapeHtml(md).replace(/^[-*] /gm, "• ");
  return listed
    .split(/(`[^`\n]+?`)/g)
    .map((part, i) => (i % 2 === 1 ? `<code>${part.slice(1, -1)}</code>` : inline(part)))
    .join("");
}
