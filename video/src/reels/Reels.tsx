import React from "react";
import { Series, interpolate, useCurrentFrame } from "remotion";
import { R1Doga, R2Baslik, R3Format, R4Zaman, R5Odul, R6Kayit, ReelBg } from "./scenes";

// Instagram duyuru Reels'i: 1080×1920, 30 fps, ~31 sn. Müzik yok; müzik Instagram'da eklenir.

type ReelDef = { id: string; dur: number; leaf?: boolean; C: React.FC<{ dur: number }> };

// Süreler kare cinsinden (30 fps).
export const REELS: ReelDef[] = [
  { id: "R1", dur: 180, leaf: true, C: R1Doga },
  { id: "R2", dur: 150, C: R2Baslik },
  { id: "R3", dur: 150, C: R3Format },
  { id: "R4", dur: 140, C: R4Zaman },
  { id: "R5", dur: 150, C: R5Odul },
  { id: "R6", dur: 170, C: R6Kayit },
];

export const REELS_TOTAL = REELS.reduce((a, s) => a + s.dur, 0);

// Zemin rengi sahne sınırlarında yumuşakça geçer: her sahnenin ilk ve son 5 karesi arası sabit.
const LEAF_IN: number[] = [];
const LEAF_OUT: number[] = [];
REELS.reduce((start, s) => {
  LEAF_IN.push(start + 5, start + s.dur - 5);
  LEAF_OUT.push(s.leaf ? 1 : 0, s.leaf ? 1 : 0);
  return start + s.dur;
}, 0);

export const Reels: React.FC = () => {
  const frame = useCurrentFrame();
  const leaf = interpolate(frame, LEAF_IN, LEAF_OUT, { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <ReelBg frame={frame} leaf={leaf}>
      <Series>
        {REELS.map((s) => (
          <Series.Sequence key={s.id} durationInFrames={s.dur} name={s.id}>
            <s.C dur={s.dur} />
          </Series.Sequence>
        ))}
      </Series>
    </ReelBg>
  );
};

/** Studio'da tek sahne önizlemesi için zeminli kabuk. */
export const reelPreview = (s: ReelDef): React.FC<{ dur: number }> => {
  const Preview: React.FC<{ dur: number }> = ({ dur }) => {
    const frame = useCurrentFrame();
    return (
      <ReelBg frame={frame} leaf={s.leaf ? 1 : 0}>
        <s.C dur={dur} />
      </ReelBg>
    );
  };
  return Preview;
};
