import React from "react";
import { AbsoluteFill, Html5Audio, Series, staticFile } from "remotion";
import { config } from "./config";
import { S01Merhaba, S02Baslik } from "./scenes/intro";
import { S03Doga, S04Gorev, S05Beklenen } from "./scenes/tema";
import { S06Kod, S07Depark, S08Gece, S09Program } from "./scenes/kurallar";
import { S10Odul } from "./scenes/odul";
import { S11Tanisma, S12Giris, S13Repo, S14Form, S15Takim, S16Teslim, S17SonSaniye, S18Muhur, S19Sonrasi } from "./scenes/muhur";
import { S20Telegram, S21Ozet, S22Bitis } from "./scenes/kapanis";
import { C } from "./theme";

type SceneDef = { id: string; dur: number; C: React.FC<{ dur: number }> };

// Süreler kare cinsinden (30 fps).
export const SCENES: SceneDef[] = [
  { id: "S01", dur: 330, C: S01Merhaba },
  { id: "S02", dur: 180, C: S02Baslik },
  { id: "S03", dur: 190, C: S03Doga },
  { id: "S04", dur: 270, C: S04Gorev },
  { id: "S05", dur: 330, C: S05Beklenen },
  { id: "S06", dur: 330, C: S06Kod },
  { id: "S07", dur: 390, C: S07Depark },
  { id: "S08", dur: 270, C: S08Gece },
  ...(config.program ? [{ id: "S09", dur: 300, C: S09Program }] : []),
  { id: "S10", dur: 240, C: S10Odul },
  { id: "S11", dur: 240, C: S11Tanisma },
  { id: "S12", dur: 210, C: S12Giris },
  { id: "S13", dur: 240, C: S13Repo },
  { id: "S14", dur: 290, C: S14Form },
  { id: "S15", dur: 190, C: S15Takim },
  { id: "S16", dur: 480, C: S16Teslim },
  { id: "S17", dur: 240, C: S17SonSaniye },
  { id: "S18", dur: 390, C: S18Muhur },
  { id: "S19", dur: 240, C: S19Sonrasi },
  { id: "S20", dur: 430, C: S20Telegram },
  { id: "S21", dur: 360, C: S21Ozet },
  { id: "S22", dur: 150, C: S22Bitis },
];

export const TOTAL = SCENES.reduce((a, s) => a + s.dur, 0);

export const Video: React.FC = () => (
  <AbsoluteFill style={{ background: C.wall }}>
    <Series>
      {SCENES.map((s) => (
        <Series.Sequence key={s.id} durationInFrames={s.dur} name={s.id}>
          <s.C dur={s.dur} />
        </Series.Sequence>
      ))}
    </Series>
    {config.music && <Html5Audio src={staticFile(`muzik/${config.music}`)} volume={(f) => Math.min(1, f / 30, (TOTAL - f) / 60) * config.musicVolume} />}
  </AbsoluteFill>
);
