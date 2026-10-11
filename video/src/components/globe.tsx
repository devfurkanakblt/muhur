import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import type { FeatureCollection } from "geojson";
import React from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land50 from "world-atlas/land-50m.json";
import { C } from "../theme";

// Kıta verisi: Natural Earth 1:50m (world-atlas). Kamu malı.
const topo = land50 as unknown as Topology<{ land: GeometryCollection }>;
const LAND = feature(topo, topo.objects.land) as FeatureCollection;
const GRATICULE = geoGraticule10();
const SPHERE = { type: "Sphere" } as const;

export type LonLat = [number, number];

export const GLOBE_COLORS = {
  ocean: "#18204a",
  land: "#3f8a5e",
  coast: C.leaf,
  grid: "rgba(157,143,255,0.16)",
};

export function makeProjection(cx: number, cy: number, r: number, rotate: [number, number]) {
  return geoOrthographic().scale(r).translate([cx, cy]).rotate(rotate).clipAngle(90).precision(0.4);
}

/** Nokta kürenin görünen yüzündeyse ekran koordinatını, değilse null döndürür. */
export function project(proj: ReturnType<typeof makeProjection>, p: LonLat): [number, number] | null {
  const [l, f] = proj.rotate();
  if (geoDistance(p, [-l, -f]) > Math.PI / 2 - 0.02) return null;
  return proj(p) as [number, number];
}

export const Globe: React.FC<{ cx: number; cy: number; r: number; rotate: [number, number]; scale?: number; children?: React.ReactNode }> = ({
  cx,
  cy,
  r,
  rotate,
  scale = 1,
  children,
}) => {
  const proj = makeProjection(cx, cy, r, rotate);
  const path = geoPath(proj);
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs>
        <radialGradient id="globe-shade" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.1} />
          <stop offset="55%" stopColor="#fff" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.42} />
        </radialGradient>
        <radialGradient id="globe-halo" cx="50%" cy="50%" r="50%">
          <stop offset="78%" stopColor={C.leaf} stopOpacity={0.16} />
          <stop offset="100%" stopColor={C.leaf} stopOpacity={0} />
        </radialGradient>
      </defs>
      <g transform={`translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`}>
        <circle cx={cx} cy={cy} r={r * 1.14} fill="url(#globe-halo)" />
        <path d={path(SPHERE) ?? ""} fill={GLOBE_COLORS.ocean} />
        <path d={path(GRATICULE) ?? ""} fill="none" stroke={GLOBE_COLORS.grid} strokeWidth={1.5} />
        <path d={path(LAND) ?? ""} fill={GLOBE_COLORS.land} stroke={GLOBE_COLORS.coast} strokeWidth={1.6} strokeLinejoin="round" />
        <circle cx={cx} cy={cy} r={r} fill="url(#globe-shade)" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.rule} strokeWidth={3} />
        {children}
      </g>
    </svg>
  );
};
