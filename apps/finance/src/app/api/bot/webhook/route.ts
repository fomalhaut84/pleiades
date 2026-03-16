import { NextRequest, NextResponse } from 'next/server'
import { createWebhookHandler } from '@/bot/index'

// 모듈 로드 시점에 eager 초기화 (콜드 스타트 제거)
// 실패 시 POST에서 재시도 (지연 초기화 fallback)
let handler: ReturnType<typeof createWebhookHandler> | null = null
try {
  handler = createWebhookHandler()
} catch (error) {
  console.warn('[webhook] 봇 eager 초기화 실패, POST에서 재시도:', error)
}

function getHandler(): ReturnType<typeof createWebhookHandler> | null {
  if (!handler) {
    try {
      handler = createWebhookHandler()
    } catch (error) {
      console.error('[webhook] 봇 초기화 재시도 실패:', error)
    }
  }
  return handler
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!botToken || !secretToken) {
      return NextResponse.json({ error: 'Not configured' }, { status: 500 })
    }

    const receivedSecret = request.headers.get('x-telegram-bot-api-secret-token')
    if (receivedSecret !== secretToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const webhookHandler = getHandler()
    if (!webhookHandler) {
      return NextResponse.json({ error: 'Bot not initialized' }, { status: 500 })
    }

    return await webhookHandler(request)
  } catch (error) {
    console.error('[webhook] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
