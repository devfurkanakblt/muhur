import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { validBearer } from "@/lib/mail/webhook";
import { runMailWorker } from "@/lib/mail/worker";
export const maxDuration = 30;
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!validBearer(request.headers.get("authorization"), env.cronSecret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json(await runMailWorker()); } catch { return NextResponse.json({ error: "E-posta kuyruğu işlenemedi." }, { status: 503 }); }
}
