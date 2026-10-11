import React from "react";
import { Composition, Folder } from "remotion";
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
  </>
);
