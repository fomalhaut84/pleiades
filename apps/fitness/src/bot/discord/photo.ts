// pleiades 009 D-2 PR-3 (pleiades#367 · 설계 P): Discord 첨부 → 음식 사진 판단(decidePhotoFood · 텔레그램과 같은 판단).
// 정책은 웹 업로드와 같다(8 MiB · jpeg/png/webp — gif 제외). 형식은 download() 전에 contentType 으로 본다(이유를 안내한다).
// 임시파일 = os.tmpdir()/mfp-photo-<ts>-<rand>.<MIME 확장자>(0o600 · wx · 처리 뒤 삭제 · 접두가 같아 기존 sweeper 가 남은 것을 치운다).

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Attachment, AttachmentPolicy, MessageContext } from "@pleiades/chat";
import { decidePhotoFood } from "../commands/food-photo-decide";
import { sanitizeError } from "../utils/error";
import { discordOutput, withTyping } from "./reply";

/** MIME → 임시파일 확장자. 이 목록이 허용 형식이다. */
export const PHOTO_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

/** chat 첨부 정책 — download() 가 형식·크기를 다시 검사한다(받는 도중에도). */
export const FIT_ATTACHMENT_POLICY: AttachmentPolicy = Object.freeze({
  maxBytes: PHOTO_MAX_BYTES,
  allowedTypes: Object.keys(PHOTO_EXTENSIONS),
});

export const PHOTO_ACK_TEXT = "🖼️ 사진 분석 중… (약 20~40초 소요)";
export const PHOTO_NOT_IMAGE_TEXT = "jpeg · png · webp 사진만 분석합니다.";
export const PHOTO_TOO_LARGE_TEXT = "사진이 너무 큽니다(8 MiB 까지).";
export const PHOTO_FIRST_ONLY_TEXT = "ℹ️ 여러 장을 받았습니다 — 첫 사진만 분석했습니다.";
/** 텔레그램 판과 같은 문구. */
export const PHOTO_FAILED_TEXT = "사진 처리 중 오류가 발생했습니다. 다시 시도해주세요.";

/** contentType → 확장자 — 허용 형식이 아니면 undefined(`image/jpeg; charset=…` 같은 매개변수는 뗀다). */
export function photoExtension(contentType: string | undefined): string | undefined {
  const t = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return PHOTO_EXTENSIONS[t];
}

export function photoTempPath(ext: string, now: number = Date.now(), dir: string = os.tmpdir()): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return path.join(dir, `mfp-photo-${now}-${rand}.${ext}`);
}

/** 첨부 없는 같은 메시지 — 텍스트 경로(명령 · 자유 텍스트)로 넘길 때. */
export function withoutAttachments(ctx: MessageContext): MessageContext {
  return { ...ctx, attachments: [] };
}

export interface PhotoDeps {
  /** 이미지가 0 인데 텍스트가 있으면 이리로 넘긴다(명령 · 자유 텍스트). */
  handleText: (ctx: MessageContext) => Promise<void>;
  tmpDir?: string;
}

/** 첨부가 있는 메시지 1건. */
export async function handleDiscordAttachment(ctx: MessageContext, deps: PhotoDeps): Promise<void> {
  const images = ctx.attachments.filter((a) => photoExtension(a.contentType) !== undefined);
  if (images.length === 0) {
    if (ctx.text.trim() !== "") {
      await deps.handleText(withoutAttachments(ctx));
      return;
    }
    await ctx.reply(PHOTO_NOT_IMAGE_TEXT);
    return;
  }
  const first = images[0];
  if (!Number.isFinite(first.size) || first.size < 0 || first.size > PHOTO_MAX_BYTES) {
    await ctx.reply(PHOTO_TOO_LARGE_TEXT);
    return;
  }
  try {
    await withTyping(() => ctx.typing(), () => analyzePhoto(ctx, first, deps.tmpDir));
  } catch (err) {
    console.error(`[discord-fit] 사진 처리 실패: ${sanitizeError(err)}`);
    await ctx.reply(PHOTO_FAILED_TEXT).catch(() => undefined);
    return;
  }
  if (ctx.attachments.length > 1) await ctx.reply(PHOTO_FIRST_ONLY_TEXT);
}

async function analyzePhoto(ctx: MessageContext, photo: Attachment, tmpDir?: string): Promise<void> {
  // 진행 안내 — 실패해도 분석은 계속(텔레그램과 같다)
  const ack = await ctx.reply(PHOTO_ACK_TEXT).catch(() => undefined);
  const tempPath = photoTempPath(photoExtension(photo.contentType) ?? "jpg", Date.now(), tmpDir);
  try {
    const bytes = await photo.download();
    // 건강 데이터 — 다른 로컬 사용자가 읽지 못하게 0o600 · 이름 충돌은 실패(wx)
    await fs.writeFile(tempPath, bytes, { mode: 0o600, flag: "wx" });
    const result = await decidePhotoFood({
      imagePath: tempPath,
      caption: ctx.text,
      sentAt: new Date(ctx.sentAt),
    });
    await discordOutput(ctx).reply(result);
  } finally {
    await ack?.delete().catch(() => undefined);
    // 쓰기 도중 실패해도 남은 조각을 지운다(없으면 무시)
    await fs.unlink(tempPath).catch(() => undefined);
  }
}
