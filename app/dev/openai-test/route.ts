import { NextResponse } from "next/server";
import { getOpenAI, CHAPTER_WORKUP_TEXT_MODEL } from "@/lib/server/openai";

// DEV: tiny synchronous probe of the configured text model. Reveals the model
// id, whether json_object works, latency, and token usage — without keys.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const client = getOpenAI();
  if (!client) {
    return NextResponse.json({ ok: false, error: "OpenAI not configured" });
  }
  const startedMs = Number(process.hrtime.bigint() / 1000000n);
  try {
    const resp = await client.chat.completions.create({
      model: CHAPTER_WORKUP_TEXT_MODEL,
      messages: [{ role: "user", content: 'Reply with this exact JSON: {"hello":"world"}' }],
      response_format: { type: "json_object" },
    });
    const elapsedMs = Number(process.hrtime.bigint() / 1000000n) - startedMs;
    return NextResponse.json({
      ok: true,
      model: CHAPTER_WORKUP_TEXT_MODEL,
      elapsedMs,
      content: resp.choices[0]?.message?.content ?? null,
      usage: resp.usage ?? null,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      model: CHAPTER_WORKUP_TEXT_MODEL,
      error: String((e as Error).message).slice(0, 400),
    });
  }
}
