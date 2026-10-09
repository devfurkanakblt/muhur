import { connection } from "next/server";
import { getStageData } from "@/lib/stage";
import { qrMatrix } from "@/lib/qr";
import { Stage } from "./stage";

export const metadata = { title: "Sahne" };

export default async function StagePage() {
  await connection();
  const initial = await getStageData();
  const qrRows = qrMatrix(`${initial.siteUrl.replace(/\/$/, "")}/`).map((row) => row.map((dark) => (dark ? "1" : "0")).join(""));
  return <Stage initial={initial} qrRows={qrRows} />;
}
