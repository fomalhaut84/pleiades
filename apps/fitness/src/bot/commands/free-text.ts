// pleiades 009 D-2 PR-2 (pleiades#364 · 설계 H2): 자유 텍스트 4 분기 — 옛 bot/index.ts `message:text` 본문.
// 순서가 판단이다: ① /food_kcal → ② 편집 대기 입력 → ③ 식단 → ④ AI. 텔레그램 · Discord 가 같은 순서를 쓴다.

import type { ReplyOutput } from "../core/reply";
import type { StateKey } from "../core/state-key";
import type { NotifyBot } from "../notifications/notifier";
import { decideAiQuestion } from "./ai";
import { decideFoodInput, decideFoodKcal, isFoodInput } from "./food";
import { decideFoodEditInput } from "./food-edit-callback";
import { shouldConsumeAsEditInput } from "./food-edit-state";

/** /food_kcal 로 시작하는 텍스트 — 텔레그램 `@봇이름` 접미 허용(정규식 명령 · 등록 명령이 아니다). */
export const FOOD_KCAL_RE = /^\/food_kcal(?:@\S+)?\b/;

export interface FreeTextOptions {
  /** 보낸 사람의 상태 키 — 없으면 편집 대기 분기를 건너뛴다. */
  stateKey: StateKey | undefined;
  /** AI 세션 채널(플랫폼별). */
  aiChannel: string;
  /** 인증 만료 admin alert 경로(lib 의 `!bot` = 웹). */
  bot?: NotifyBot;
}

/** 텍스트 1건 처리. `text` 는 앞뒤 공백을 뗀 원문. */
export async function decideFreeText(
  text: string,
  out: ReplyOutput,
  options: FreeTextOptions,
): Promise<void> {
  // #283: /food_kcal <id> <kcal> — 이전 로그 kcal 정정 (backward-compat).
  // #350: 명령은 편집 pending 보다 우선. pending 중에도 명령이 정상 동작해야 한다.
  if (FOOD_KCAL_RE.test(text)) {
    await decideFoodKcal(text, out);
    return;
  }

  // #292: 편집 프롬프트 이후 입력 처리 (kcal 숫자 / 설명 텍스트).
  // #350: reply_to_message 대신 chat 단위 pending 으로 라우팅 (force_reply 폐기).
  // 소비 조건은 shouldConsumeAsEditInput 에 있다 (회귀 스크립트가 검증 — 사전 리뷰 P0).
  const { stateKey } = options;
  if (stateKey !== undefined && shouldConsumeAsEditInput(stateKey, text)) {
    const handled = await decideFoodEditInput(stateKey, text, out);
    if (handled) return;
  }

  // 식단 입력 감지
  if (isFoodInput(text)) {
    await decideFoodInput(text, out);
    return;
  }

  // 그 외 텍스트 → AI 질문 (#253: bot 참조 전달로 인증 만료 감지 시 관리자 alert 가능).
  await decideAiQuestion(text, out, { channel: options.aiChannel, bot: options.bot });
}
