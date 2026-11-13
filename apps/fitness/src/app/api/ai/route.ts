import { NextResponse } from "next/server";
import { askAdvisor, resetSession, getSessionId } from "@/lib/ai/claude-advisor";
import prisma from "@/lib/prisma";
import { formatUserFriendlyError } from "@/lib/monitoring/admin-alerts";
import { sanitizeError } from "@/bot/utils/error";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = body.prompt;

    // 세션 초기화 명령
    if (body.action === "reset") {
      resetSession("web");
      return NextResponse.json({ result: "세션이 초기화되었습니다.", sessionId: null });
    }

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "prompt 필드가 필요합니다" },
        { status: 400 }
      );
    }

    const { result, sessionId, duration_ms, systemPromptVersionId } = await askAdvisor(prompt, {
      channel: "web",
    });

    // AI 조언 이력 저장
    await prisma.aIAdvice.create({
      data: {
        category: body.category ?? "general",
        prompt,
        response: result,
        // #552 M19-2: 채팅은 시스템 프롬프트만
        systemPromptVersionId,
      },
    });

    return NextResponse.json({
      result,
      sessionId,
      duration_ms,
    });
  } catch (error) {
    // #666: 원문(CLI stderr 일부 포함 가능)은 서버 로그로만 — 응답은 분류된 정적 문구. 웹은 관리자 알림 경로가 없다
    console.error(`[api/ai] failed: ${sanitizeError(error)}`);
    return NextResponse.json({ error: formatUserFriendlyError(error, { adminAlerted: false }) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ sessionId: getSessionId("web") });
}
