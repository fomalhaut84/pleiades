#!/usr/bin/env node
// chat-live-check.cjs — @pleiades/chat 를 로컬 **검증** Discord 봇으로 한 번 띄워 수신·응답·첨부를 실측한다 (009 D-0 · #332).
//
// 사용(앱 cwd · run.sh 가 check_env 로 검증 봇 토큰만 허용한다 — I-4′):
//   npm run build                                   # pleiades 루트 — packages/notify · packages/chat dist
//   tools/local/run.sh fit -- node ../../tools/local/chat-live-check.cjs fit
// 검증 서버의 채널(DISCORD_CHANNEL_ID_<APP> · 있으면 DISCORD_CHANNEL_ID_<APP>_CHAT 도)에서 아래 말을 보낸다. `끝` 이면 종료 · 15분 뒤 자동 종료.
// 토큰·웹훅은 출력하지 않는다. IDENTIFY 기록은 <루트>/.chat-local/identify-<app>.json(gitignored).
'use strict'

const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const { platformEnv } = require(path.join(ROOT, 'packages/notify/dist'))
const { createChat, createRouter, createIdentifyGuard, fileGuardStore } = require(path.join(ROOT, 'packages/chat/dist'))

const app = process.argv[2]
const APPS = { fin: 'FINANCE', fit: 'FITNESS' }
if (!(app in APPS)) {
  console.error('사용법: chat-live-check.cjs <fin|fit>')
  process.exit(2)
}
const KEY = APPS[app]
const csv = (k) => (platformEnv(k) || '').split(',').map((s) => s.trim()).filter(Boolean)
const channels = [...csv(`DISCORD_CHANNEL_ID_${KEY}`), ...csv(`DISCORD_CHANNEL_ID_${KEY}_CHAT`)]
const users = csv('DISCORD_ALLOWED_USER_IDS')
if (!platformEnv(`DISCORD_BOT_TOKEN_${KEY}`) || channels.length === 0 || users.length === 0) {
  console.error(`DISCORD_BOT_TOKEN_${KEY} · DISCORD_CHANNEL_ID_${KEY} · DISCORD_ALLOWED_USER_IDS 가 필요하다(루트 .env)`)
  process.exit(2)
}

const label = `discord-${app}`
const results = new Map() // 항목 → 통과 시각
const pass = (item) => {
  if (!results.has(item)) console.log(`[live] 통과: ${item}`)
  results.set(item, new Date().toISOString())
}

const BUTTONS = [[{ label: '버튼 바꾸기', action: 'live:swap' }, { label: '본문 편집', action: 'live:edit' }], [{ label: '링크', url: 'https://discord.com' }]]

let chat
const router = createRouter()
  .command(['핑', 'ping'], async (ctx) => {
    await ctx.reply('퐁 — 메시지 수신·응답')
    pass('메시지 수신·응답')
  })
  .command('긴글', async (ctx) => {
    const lines = Array.from({ length: 150 }, (_, i) => `${String(i + 1).padStart(3, '0')} ${'가나다라마바사아자차'.repeat(2)}`)
    await ctx.reply({ text: `${lines.join('\n')}\n— 끝(150줄 · 버튼은 이 마지막 조각에)`, buttons: BUTTONS })
    pass('2000자 초과 분할(001~150 이 빠짐없이 순서대로인지 눈으로 확인)')
  })
  .command('버튼', async (ctx) => {
    await ctx.reply({ text: '<b>버튼 시험</b> — 아래 버튼을 눌러 본다', format: 'html', buttons: BUTTONS })
  })
  .command('편집', async (ctx) => {
    const sent = await ctx.reply({ text: '3초 뒤 이 메시지가 바뀐다', buttons: BUTTONS })
    await new Promise((r) => setTimeout(r, 3000))
    await sent.edit({ text: '<i>인터랙션 밖 편집 완료</i> — 버튼은 지웠다', format: 'html', buttons: [] })
    pass('인터랙션 밖 편집 · 버튼 제거')
  })
  .command('파일', async (ctx) => {
    await ctx.replyFile({ name: 'live-check.txt', data: new TextEncoder().encode(`pleiades chat live check ${new Date().toISOString()}\n`), contentType: 'text/plain', caption: '봇 경로 파일' })
    pass('봇 경로 파일 전송')
  })
  .command('끝', async (ctx) => {
    await ctx.reply(`종료 — 통과 ${results.size}건`)
    finish()
  })
  .attachment(async (ctx) => {
    for (const a of ctx.attachments) {
      try {
        const data = await a.download()
        await ctx.reply(`첨부 받음 · ${a.name} · 알려진 ${a.size} B · 받은 ${data.byteLength} B · ${a.contentType}`)
        pass('첨부 수신(허용 형식)')
      } catch (err) {
        await ctx.reply(`첨부 거부 · ${a.name} · ${err instanceof Error ? err.message : '오류'}`)
        pass('첨부 거부(허용 밖 형식·크기)')
      }
    }
  })
  .fallback(async (ctx) => {
    await ctx.reply('명령: 핑 · 긴글 · 버튼 · 편집 · 파일 · (사진 첨부) · (pdf 등 첨부 = 거부 확인) · 끝')
  })
  .action('live:swap', async (ctx) => {
    await ctx.setButtons([[{ label: '되돌리기', action: 'live:restore' }]])
    await ctx.notice('버튼을 바꿨다(누른 사람에게만 보이는 안내)')
    pass('버튼 교체 · 본인 안내')
  })
  .action('live:restore', async (ctx) => {
    await ctx.setButtons(BUTTONS)
  })
  .action('live:edit', async (ctx) => {
    await ctx.edit({ text: '<b>버튼으로 원본 편집</b> — 버튼은 지워졌다', format: 'html' })
    pass('버튼 → 원본 편집')
  })

function finish() {
  chat.stop()
  console.log('[live] 결과')
  for (const [item, at] of results) console.log(`  ✓ ${item} (${at})`)
  setTimeout(() => process.exit(0), 500)
}

chat = createChat({
  token: () => platformEnv(`DISCORD_BOT_TOKEN_${KEY}`) || '',
  router,
  allowedUserIds: () => users,
  allowedChannelIds: () => channels,
  label,
  identifyGuard: createIdentifyGuard({
    store: fileGuardStore(path.join(ROOT, '.chat-local', `identify-${app}.json`)),
    onBlocked: (info) => console.error(`[live] IDENTIFY 차단 — ${info.reason} · ${info.count}/${info.limit}`),
  }),
})
console.log(`[live] ${label} 시작 · 허용 채널 ${channels.length} · 허용 사용자 ${users.length} · 15분 뒤 자동 종료`)
chat.start()
setTimeout(finish, 15 * 60 * 1000)
process.on('SIGINT', finish)
