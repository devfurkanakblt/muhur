import React from "react";
import { useCurrentFrame } from "remotion";
import { Bubble, Confetti, Kicker, Scene, Sfx, Words } from "../components/ui";
import { Mascot } from "../mascot/Mascot";
import { C } from "../theme";

/* S10 · Ödül */

export const S10Odul: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  return (
    <Scene dur={dur}>
      <div style={{ position: "absolute", top: 110, width: 1920, display: "grid", justifyItems: "center", gap: 26, textAlign: "center" }}>
        <Kicker at={4} color={C.blush}>Ödül</Kicker>
        <Words text="Birinci takımın her üyesine" at={8} size={70} weight={600} color={C.ink2} accent={["her"]} accentColor={C.ink} dot={false} />
        <Words text="1 yıllık Claude Pro!" at={30} size={150} accent={["Claude", "Pro!"]} dot={false} />
      </div>
      <Confetti at={34} originX={960} originY={700} />
      <Sfx name="konfeti" at={34} />
      <Mascot frame={frame} x={960} y={1060} size={470} mood="mutlu" accessories={["kupa"]} enterAt={20} hop={frame > 60} />
      <Bubble at={120} x={1240} y={560} size={46} width={560} tail="l">
        Evet, sen dahil. Evet, takımdaki herkes. 🏆
      </Bubble>
    </Scene>
  );
};
