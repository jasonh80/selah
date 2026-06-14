import { NextResponse } from "next/server";

// TEMP DIAGNOSTIC (safe): reports ONLY booleans + string lengths so we can tell
// whether the runtime function actually sees the gating env vars. Never returns
// any secret value. Remove once env scoping is confirmed.
export const dynamic = "force-dynamic";

function info(v: string | undefined) {
  return {
    set: typeof v === "string" && v.length > 0,
    isTrue: v === "true",
    trimmedIsTrue: (v ?? "").trim() === "true",
    len: (v ?? "").length, // length only — never the value
  };
}

export async function GET() {
  return NextResponse.json({
    ENABLE_DEV_ROUTES: info(process.env.ENABLE_DEV_ROUTES),
    ENABLE_CHAPTER_IMAGE_GENERATION: info(process.env.ENABLE_CHAPTER_IMAGE_GENERATION),
    CHAPTER_IMAGE_MODEL_set: typeof process.env.CHAPTER_IMAGE_MODEL === "string" && process.env.CHAPTER_IMAGE_MODEL.length > 0,
    DEV_ADMIN_TOKEN_set: typeof process.env.DEV_ADMIN_TOKEN === "string" && process.env.DEV_ADMIN_TOKEN.length > 0,
    ENABLE_CHAPTER_GENERATION_isTrue: process.env.ENABLE_CHAPTER_GENERATION === "true",
  });
}
