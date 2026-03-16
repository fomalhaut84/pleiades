import { Bot } from 'grammy'

const COMMANDS_HELP =
  `📌 사용 가능한 커맨드:\n` +
  `/start — 봇 소개\n` +
  `/help — 도움말\n\n` +
  `한글 명령어 (슬래시 없이 입력):\n` +
  `현황 — 전체 포트폴리오 요약\n` +
  `계좌 [이름] — 계좌 상세 (세진/소담/다솜)\n` +
  `주가 [종목] — 종목 현재가\n` +
  `환율 — USD/KRW 환율\n` +
  `매수 [계좌] [종목] [수량] [가격] — 매수 기록\n` +
  `매도 [계좌] [종목] [수량] [가격] — 매도 기록\n\n` +
  `소비/수입 기록 (자연어 입력):\n` +
  `점심 12000 — 소비 기록 + 카테고리 자동 분류\n` +
  `택시 4500 — 소비 기록\n` +
  `수입 월급 5000000 — 수입 기록`

export function registerCommands(bot: Bot): void {
  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name ?? '사용자'
    await ctx.reply(
      `안녕하세요, ${name}님! 👋\n\n` +
        `myFinance 봇입니다.\n` +
        `포트폴리오 조회와 매매 기록을 도와드립니다.\n\n` +
        COMMANDS_HELP
    )
  })

  bot.command('help', async (ctx) => {
    await ctx.reply(COMMANDS_HELP)
  })
}
