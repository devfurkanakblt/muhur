import { NextResponse, type NextRequest } from "next/server";
import { archiveExpiryTick } from "@/lib/archive-expiry";
import { env } from "@/lib/env";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Süreli arşiv silme: teslim/mühür cron'undan ayrı. Canlıda yalnız 0021 ve head admin aktivasyonundan sonra
// bir şey yapar; ayar kapalıyken çağrı yan etkisizdir (supabase/cron/plan5_archive_expiry.sql).
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await archiveExpiryTick());
}
