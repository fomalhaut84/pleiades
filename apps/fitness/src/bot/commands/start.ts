import { htmlReply, plainReply, type BotReply } from "../core/reply";

/** /start — 도움말(판단 · pleiades#364). */
export function decideStart(): BotReply {
  return htmlReply(
    "🏃 <b>myFitness 봇</b>\n\n" +
      "Garmin 데이터 기반 피트니스 어드바이저\n\n" +
      "<b>커맨드:</b>\n" +
      "/today — 오늘 요약\n" +
      "/run — 최근 러닝\n" +
      "/sleep — 어젯밤 수면\n" +
      "/weight — 최근 체중\n" +
      "/sync — 데이터 싱크\n" +
      "/report — 최근 리포트\n" +
      "/ai [질문] — AI 어드바이저\n" +
      "/reset — AI 세션 초기화\n\n" +
      "자유 텍스트로 질문하거나\n" +
      '"점심 김치찌개 밥" 형태로 식단 기록'
  );
}

/** /help — /start 안내(판단 · pleiades#364). */
export function decideHelp(): BotReply {
  return plainReply("/start 참조");
}
