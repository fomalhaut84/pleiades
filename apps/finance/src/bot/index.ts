import { BOT_PROCESS_WITHOUT_TELEGRAM, type NotifyBot } from './notifications/notifier'

/**
 * 아웃바운드 핸들 — 늘 텔레그램 없는 핸들(Discord 라우트만). 텔레그램 봇 인스턴스·명령 등록은 지웠다(009 D-5 B3b · pleiades#508).
 * 웹·MCP·크론이 이것을 부른다(import 가 grammY·명령 전체를 끌고 오지 않는다). 인자째 지우는 것은 B4(`notifierFor()`).
 */
export function notifyBot(): NotifyBot {
  return BOT_PROCESS_WITHOUT_TELEGRAM
}
