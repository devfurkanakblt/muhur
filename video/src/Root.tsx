import React from "react";
import { Composition, Folder } from "remotion";
import { REELS, REELS_TOTAL, Reels, reelPreview } from "./reels/Reels";
import { RH, RW } from "./reels/scenes";
import { FPS, H, W } from "./theme";
import { SCENES, TOTAL, Video } from "./Video";

export const Root: React.FC = () => (
  <>
    <Composition id="EkoZekaAcilis" component={Video} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    {/* Tek tek sahneler: Studio'da önizleme ve kontrol kareleri için. */}
    <Folder name="Sahneler">
      {SCENES.map((s) => (
        <Composition key={s.id} id={s.id} component={s.C} defaultProps={{ dur: s.dur }} durationInFrames={s.dur} fps={FPS} width={W} height={H} />
      ))}
    </Folder>
    <Composition id="EkoZekaReels" component={Reels} durationInFrames={REELS_TOTAL} fps={FPS} width={RW} height={RH} />
    <Folder name="Reels-sahneleri">
      {REELS.map((s) => (
        <Composition key={s.id} id={s.id} component={reelPreview(s)} defaultProps={{ dur: s.dur }} durationInFrames={s.dur} fps={FPS} width={RW} height={RH} />
      ))}
    </Folder>
  </>
);
