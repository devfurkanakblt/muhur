import { NextResponse, type NextRequest } from "next/server";
import { tick } from "@/lib/freeze";
import { env } from "@/lib/env";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Supabase pg_cron her dakika (ve Vercel Cron günde bir yedek olarak) çağırır:
// kilit zamanı geldiyse kilitler ve mühürler; değilse repo sağlığını ve ara mühürleri yürütür.
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await tick());
}
