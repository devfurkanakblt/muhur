import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";
import { mailEvents, validBearer } from "@/lib/mail/webhook";
export async function POST(request: NextRequest) {
  if (!validBearer(request.headers.get("authorization"), env.brevoWebhookSecret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const reader = request.body?.getReader(); if (!reader) return NextResponse.json({ error: "body" }, { status: 400 });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 65536) { await reader.cancel(); return NextResponse.json({ error: "size" }, { status: 413 }); } chunks.push(value); }
    const events = mailEvents(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const db = createAdminClient();
    for (const event of events) { const result = await db.rpc("record_mail_event", event); if (result.error) return NextResponse.json({ error: "retry" }, { status: 503 }); }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "invalid event" }, { status: 400 }); }
}
