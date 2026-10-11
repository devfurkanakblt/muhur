import { loadFont as loadGrotesk } from "@remotion/google-fonts/SchibstedGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Gece galerisi: sitenin koyu teması (DESIGN.md).
export const C = {
  wall: "#0e1020",
  plinth: "#161a2e",
  ink: "#e8eaf4",
  ink2: "#aeb3c9",
  ink3: "#8e94ad",
  rule: "#2a2f4a",
  indigo: "#9d8fff",
  indigoFill: "#5b46e6",
  blush: "#feccd7",
  leaf: "#7fd99a",
  paper: "#fbf6f8",
  deep: "#0b0d1e",
  danger: "#ff7a8f",
  // maskot
  mInk: "#00051D",
  mFill: "#FBF6F8",
  mBlush: "#FECCD7",
  mViolet: "#8466F3",
  mVioletDeep: "#523BD3",
} as const;

const grotesk = loadGrotesk("normal", { weights: ["400", "600", "800"], subsets: ["latin", "latin-ext"] });
const mono = loadMono("normal", { weights: ["400", "600"], subsets: ["latin", "latin-ext"] });

export const F = {
  display: `${grotesk.fontFamily}, "Segoe UI", system-ui, sans-serif`,
  mono: `${mono.fontFamily}, Consolas, monospace`,
};

export const W = 1920;
export const H = 1080;
export const FPS = 30;
