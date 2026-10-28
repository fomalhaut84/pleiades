// #309 (M14 Phase 2 #5): 텔레그램 음식 사진 handler.
// 사진 메시지 수신 → 최대 사이즈 download → temp 저장 → Vision → FoodLog 생성 → 3-버튼 답장.
// 이미지는 처리 후 즉시 삭제 (spec: 보관 안 함).
//
// pleiades 009 D-2 PR-2 (pleiades#364 · 설계 H2 · C 표): 텔레그램 파일 다운로드 · typing · ack 메시지 · ack 삭제 ·
// 4096 절단은 텔레그램 어댑터(handleFoodPhoto)에 남기고, 다운로드 뒤 판단(캡션 → Vision → 저장 → 응답 모델)만
// decidePhotoFood 로 뺐다 — Discord 첨부 경로(PR-3)가 같은 판단을 쓴다.

import fs from "fs/promises";
import { createWriteStream } from "fs";
import https from "https";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import type { Bot, Context } from "grammy";
import { telegramAgent } from "../index";
import { sendTelegramReply } from "../utils/telegram-reply";
import { decidePhotoFood } from "./food-photo-decide";

// 판단은 food-photo-decide.ts(pleiades#367) — 기존 import 경로를 지키려고 다시 내보낸다
export { decidePhotoFood };

const TG_FILE_HOST = "https://api.telegram.org/file/bot";
// Codex P1 (PR #310 3회차): grammy 는 IPv4-only agent 로 통신하는데 download 가 global fetch 면
// IPv6-preferred 로 stall 위험. https.request 로 telegramAgent 재사용.
const DOWNLOAD_TIMEOUT_MS = 30_000;

async function downloadTo(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { agent: telegramAgent, timeout: DOWNLOAD_TIMEOUT_MS },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`텔레그램 파일 다운로드 실패 (${res.statusCode ?? "?"})`));
          return;
        }
        // Codex P2 (PR #310 7회차): 건강 데이터 프라이버시 — mode 0o600 + wx (exclusive) 로
        // 다른 로컬 사용자 read 차단. 이름 충돌 시 EEXIST 로 실패 (random 접미사라 실질 X).
        pipeline(res, createWriteStream(dest, { mode: 0o600, flags: "wx" }))
          .then(() => resolve())
          .catch(reject);
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error(`텔레그램 다운로드 timeout (${DOWNLOAD_TIMEOUT_MS}ms)`));
    });
    req.on("error", reject);
  });
}

export function registerFoodPhotoHandler(bot: Bot): void {
  bot.on("message:photo", async (ctx) => {
    try {
      await handleFoodPhoto(ctx);
    } catch (err) {
      console.error("[food-photo] handler 예외:", err);
      try {
        await ctx.reply("사진 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
      } catch {
        // ignore
      }
    }
  });
}

async function handleFoodPhoto(ctx: Context): Promise<void> {
  const message = ctx.message;
  if (!message?.photo || message.photo.length === 0) return;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    await ctx.reply("서버 설정 오류 (bot token 없음). 관리자에게 문의해주세요.");
    return;
  }

  // Codex P2 (PR #310 4회차): 자정 근처 사진이 download + Vision (최대 45s) 이 지나 다음날로
  // 저장되는 것 방지. message.date (텔레그램 unix seconds) 를 사진 촬영·전송 시점으로 사용.
  // fallback 은 handler 진입 시점 — Vision 대기 시간에 영향 안 받음.
  const photoTimestamp =
    typeof message.date === "number" ? new Date(message.date * 1000) : new Date();

  const largest = message.photo[message.photo.length - 1];

  // 즉시 사용자 피드백. Vision 이 30초 이상 걸릴 수 있어 무응답 방지.
  try {
    await ctx.replyWithChatAction?.("typing");
  } catch {
    // ignore
  }
  let ackMsgId: number | undefined;
  try {
    const ack = await ctx.reply("🖼️ 사진 분석 중… (약 20~40초 소요)");
    ackMsgId = ack.message_id;
  } catch {
    // ignore
  }

  // 텔레그램 파일 다운로드 → temp.
  const rand = Math.random().toString(36).slice(2, 10);
  const tempPath = path.join(os.tmpdir(), `mfp-photo-${Date.now()}-${rand}.jpg`);
  try {
    const file = await ctx.api.getFile(largest.file_id);
    if (!file.file_path) {
      throw new Error("텔레그램 파일 경로 없음");
    }
    const url = `${TG_FILE_HOST}${token}/${file.file_path}`;
    await downloadTo(url, tempPath);

    const result = await decidePhotoFood({
      imagePath: tempPath,
      caption: message.caption,
      sentAt: photoTimestamp,
    });

    // 최종 응답 (ack 삭제는 아래 finally 에서 정리).
    // Codex P2 (릴리즈 PR #311): Vision 이 items 많거나 notes 길면 4096 초과 → reply 실패 →
    // 저장 이후 outer catch 로 "사진 처리 오류" 안내 → 사용자가 재전송해 중복 로그 유발.
    // Codex P2 (PR #314): UTF-16 surrogate pair 사이에서 자르면 unpaired high surrogate →
    // malformed Unicode → Telegram reject. code point 단위로 순회하며 4095 UTF-16 code
    // units (1 for '…') 이내로 맞춤.
    const TELEGRAM_MAX_MESSAGE = 4096;
    let replyText = result.text;
    if (replyText.length > TELEGRAM_MAX_MESSAGE) {
      const limit = TELEGRAM_MAX_MESSAGE - 1; // '…' 자리 확보
      let utf16Len = 0;
      let cut = 0;
      for (const ch of replyText) {
        if (utf16Len + ch.length > limit) break;
        utf16Len += ch.length;
        cut += ch.length;
      }
      replyText = replyText.slice(0, cut) + "…";
    }
    await sendTelegramReply(ctx, { ...result, text: replyText });
  } finally {
    // 사전 리뷰 P1 (feat/309-1): ack 삭제를 finally 로. 이전엔 성공 경로에서만 삭제 →
    // getFile/download/Vision/DB 중 throw 시 "🖼️ 사진 분석 중…" 이 채팅에 영구히 남고
    // 상위 catch 의 에러 답장과 중첩되어 상태 혼란. 실패 경로에서도 반드시 정리.
    if (ackMsgId !== undefined && ctx.chat?.id !== undefined) {
      await ctx.api.deleteMessage(ctx.chat.id, ackMsgId).catch(() => {
        // ignore — 이미 삭제됐거나 권한 이슈
      });
    }
    await fs.unlink(tempPath).catch(() => {
      // ignore — temp 정리 실패는 치명적이지 않음
    });
  }
}
