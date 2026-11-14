import { NextResponse } from "next/server";
import { getStageData } from "@/lib/stage";
import { eventFromRequest } from "@/lib/event-request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const event = await eventFromRequest(request);
  if (event instanceof Response) return event;
  return NextResponse.json(await getStageData(event), { headers: { "Cache-Control": "no-store" } });
}
