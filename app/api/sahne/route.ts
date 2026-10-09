import { NextResponse } from "next/server";
import { getStageData } from "@/lib/stage";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getStageData(), { headers: { "Cache-Control": "no-store" } });
}
