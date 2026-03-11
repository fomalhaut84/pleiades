import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!secretToken) {
      console.error('[webhook] TELEGRAM_WEBHOOK_SECRET 미설정')
      return NextResponse.json({ error: 'Not configured' }, { status: 500 })
    }

    const header = request.headers.get('x-telegram-bot-api-secret-token')
    if (header !== secretToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { createWebhookHandler } = await import('@/bot/index')
    const handler = createWebhookHandler()
    return await handler(request)
  } catch (error) {
    console.error('[webhook] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
