import { Mascot } from "@/components/mascot/mascot";
import { qrCenterHole } from "@/lib/qr-hole";

/**
 * Sahne karekodu: H seviyesi, ortada dürbünlü maskot.
 * Zemin her temada sitenin açık zemini (#eef2f6): ters renkli (koyu zeminde açık) karekodları
 * birçok telefon kamerası okuyamıyor; okunabilirlik için renkler sabit.
 */
export function StageQr({ rows, className = "" }: { rows: string[]; className?: string }) {
  const n = rows.length;
  const quiet = 3;
  const view = n + quiet * 2;
  const { start: hole, side } = qrCenterHole(n);
  const inHole = (x: number, y: number) => x >= hole && x < hole + side && y >= hole && y < hole + side;

  // Göz desenlerinin iç kareleri indigo; geri kalan modüller kömür.
  const eyes = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ];
  const inEyeCore = (x: number, y: number) => eyes.some(([ex, ey]) => x >= ex + 2 && x < ex + 5 && y >= ey + 2 && y < ey + 5);

  let ink = "";
  let core = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < n; x++) {
      if (row[x] !== "1" || inHole(x, y)) continue;
      const cell = `M${x + quiet},${y + quiet}h1v1h-1z`;
      if (inEyeCore(x, y)) core += cell;
      else ink += cell;
    }
  });

  const pad = 0.4;
  return (
    <svg viewBox={`0 0 ${view} ${view}`} className={className} role="img" aria-label="Vitrini açan karekod">
      <rect width={view} height={view} rx={1.2} fill="#eef2f6" />
      <path d={ink} fill="#0b0d1e" shapeRendering="crispEdges" />
      <path d={core} fill="#4a36cf" shapeRendering="crispEdges" />
      <svg x={hole + quiet + pad} y={hole + quiet + pad} width={side - pad * 2} height={side - pad * 2}>
        <Mascot mood="durbun" title="" />
      </svg>
    </svg>
  );
}
