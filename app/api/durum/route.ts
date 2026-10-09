import { getLiveStatus } from "@/lib/status";

export async function GET() {
  return Response.json(await getLiveStatus(), { headers: { "Cache-Control": "private, no-store" } });
}
