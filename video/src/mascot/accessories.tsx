import React from "react";
import { C } from "../theme";

// Aksesuarlar maskotun 4x koordinat sisteminde (viewBox "20 70 1310 1070") çizilir,
// böylece maskotla birlikte zıplar, esner, döner. Çıkartma setindeki gibi gövdenin önünde dururlar.
// bant, laptop, pizza, kahve, kalp ve gözlük sitedeki maskottan alındı.

export type AccessoryName =
  | "bant"
  | "laptop"
  | "pizza"
  | "kahve"
  | "kalp"
  | "gozluk"
  | "buyutec"
  | "kulaklik"
  | "yastik"
  | "megafon"
  | "kupa"
  | "telefon";

const INK = C.mInk;

export const Accessory: React.FC<{ name: AccessoryName | "kulaklik-arka"; frame: number; drop?: number }> = ({ name, frame, drop = 1 }) => {
  switch (name) {
    case "bant":
      return <path d="M60 540 Q520 260 1100 300" stroke={C.mVioletDeep} strokeWidth={96} fill="none" clipPath="url(#mascot-head)" />;
    case "laptop": {
      const on = Math.floor(frame / 15) % 2 === 0;
      return (
        <g>
          <path d="M706 742 L1196 690 Q1214 688 1212 706 L1176 1004 Q1174 1020 1156 1022 L676 1074 Q660 1076 662 1058 L690 760 Q692 744 706 742 Z" fill="#2A2547" />
          <path d="M560 1080 L1150 1018 L1210 1060 L620 1124 Q590 1126 576 1110 Z" fill={INK} />
          <g stroke="#F3F0FF" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={on ? 1 : 0.55}>
            <path d="M870 852 L834 884 L874 912" />
            <path d="M958 836 L930 924" />
            <path d="M1008 832 L1048 860 L1014 894" />
          </g>
        </g>
      );
    }
    case "pizza":
      return (
        <g strokeLinejoin="round">
          <path d="M676 800 L918 1030 Q716 1104 506 1062 Z" fill="#FFCF5C" stroke={INK} strokeWidth={16} />
          <path d="M494 1050 Q716 1100 930 1018 L944 1062 Q716 1158 498 1100 Z" fill="#E39B4B" stroke={INK} strokeWidth={16} />
          <g fill="#D9474F">
            <circle cx={690} cy={938} r={32} />
            <circle cx={800} cy={1010} r={26} />
            <circle cx={604} cy={1018} r={24} />
          </g>
        </g>
      );
    case "kahve":
      return (
        <g strokeLinejoin="round" strokeLinecap="round">
          <g stroke="#B9A9FF" strokeWidth={16} fill="none" transform={`translate(0 ${-(frame % 40)})`} opacity={1 - (frame % 40) / 50}>
            <path d="M766 836 Q744 802 766 768 Q788 734 766 700" />
            <path d="M846 836 Q824 802 846 768 Q868 734 846 700" />
          </g>
          <path d="M944 912 Q1030 912 1030 984 Q1030 1056 944 1056" stroke={INK} strokeWidth={28} fill="none" />
          <rect x={700} y={856} width={250} height={250} rx={32} fill={C.mVioletDeep} stroke={INK} strokeWidth={16} />
          <rect x={700} y={896} width={250} height={24} fill={C.mViolet} />
        </g>
      );
    case "kalp": {
      const b = 1 + Math.max(0, Math.sin(frame / 4)) * 0.08;
      return (
        <path
          transform={`translate(830 960) scale(${b}) translate(-830 -960)`}
          d="M830 1096 C700 1010 632 930 690 858 C736 802 806 816 830 872 C854 816 924 802 970 858 C1028 930 960 1010 830 1096 Z"
          fill="#E8536B"
          stroke={INK}
          strokeWidth={16}
          strokeLinejoin="round"
        />
      );
    }
    case "gozluk": {
      const y = (drop - 1) * 700;
      const r = (1 - Math.min(drop, 1)) * -14;
      return (
        <g transform={`translate(0 ${y}) rotate(${r} 650 650)`}>
          <rect x={352} y={566} width={600} height={34} rx={14} fill={INK} />
          <path d="M370 590 H636 L622 712 Q616 752 576 752 H436 Q396 752 388 714 Z" fill={INK} />
          <path d="M668 590 H934 L916 714 Q908 752 868 752 H728 Q688 752 682 712 Z" fill={INK} />
          <path d="M430 628 L486 628 M726 628 L782 628" stroke="#3B3A55" strokeWidth={16} strokeLinecap="round" />
        </g>
      );
    }
    case "buyutec":
      // Büyüteç sol gözün önünde: göz camın ardında büyük görünür.
      return (
        <g strokeLinecap="round">
          <path d="M440 760 L250 1010" stroke={INK} strokeWidth={56} />
          <path d="M440 760 L250 1010" stroke="#6B5A3A" strokeWidth={30} />
          <clipPath id="lens">
            <circle cx={528} cy={650} r={138} />
          </clipPath>
          <circle cx={528} cy={650} r={138} fill="#EAF1FF" />
          <g clipPath="url(#lens)">
            <rect x={528 - 55} y={650 - 100} width={110} height={200} rx={55} fill={INK} />
            <circle cx={510} cy={600} r={20} fill="#fff" />
          </g>
          <circle cx={528} cy={650} r={138} fill="rgba(200,220,255,0.18)" stroke={INK} strokeWidth={30} />
          <path d="M440 590 Q462 548 512 536" stroke="#fff" strokeWidth={14} fill="none" />
        </g>
      );
    case "kulaklik-arka":
      return <path d="M196 640 Q170 120 650 110 Q1120 110 1090 640" stroke={INK} strokeWidth={70} fill="none" strokeLinecap="round" />;
    case "kulaklik": {
      const beat = Math.floor(frame / 10) % 2 === 0 ? 1 : 0.6;
      return (
        <g>
          <path d="M196 640 Q170 120 650 110 Q1120 110 1090 640" stroke={C.mVioletDeep} strokeWidth={34} fill="none" strokeLinecap="round" />
          {[
            { x: 196, d: -1 },
            { x: 1090, d: 1 },
          ].map((c) => (
            <g key={c.x}>
              <rect x={c.x - 90} y={560} width={180} height={230} rx={70} fill={C.mVioletDeep} stroke={INK} strokeWidth={18} />
              <rect x={c.x - 50} y={610} width={100} height={130} rx={40} fill={C.mViolet} />
              <g stroke={C.mViolet} strokeWidth={18} strokeLinecap="round" opacity={beat}>
                <path d={`M${c.x + c.d * 140} 600 Q${c.x + c.d * 175} 675 ${c.x + c.d * 140} 750`} fill="none" />
              </g>
            </g>
          ))}
        </g>
      );
    }
    case "yastik":
      return (
        <g strokeLinejoin="round">
          <path d="M150 930 Q140 880 200 880 L600 870 Q660 868 650 930 L640 1100 Q636 1150 580 1150 L210 1150 Q150 1150 150 1100 Z" fill="#D9D3FF" stroke={INK} strokeWidth={18} />
          <path d="M210 930 L590 922" stroke={C.mViolet} strokeWidth={10} strokeDasharray="22 18" strokeLinecap="round" />
          <path d="M210 1096 L590 1096" stroke={C.mViolet} strokeWidth={10} strokeDasharray="22 18" strokeLinecap="round" />
        </g>
      );
    case "megafon":
      return (
        <g strokeLinejoin="round" strokeLinecap="round">
          <path d="M470 860 L170 730 L170 1060 L470 950 Z" fill={C.mVioletDeep} stroke={INK} strokeWidth={22} />
          <rect x={460} y={846} width={110} height={118} rx={24} fill={C.mViolet} stroke={INK} strokeWidth={22} />
          <path d="M520 964 L540 1060" stroke={INK} strokeWidth={36} />
          <ellipse cx={170} cy={895} rx={40} ry={165} fill={C.mViolet} stroke={INK} strokeWidth={22} />
          <g stroke={C.mViolet} strokeWidth={26} opacity={Math.floor(frame / 5) % 2 === 0 ? 1 : 0.5}>
            <path d="M90 760 L20 700" />
            <path d="M70 895 L-20 895" />
            <path d="M90 1030 L20 1090" />
          </g>
        </g>
      );
    case "kupa":
      return (
        <g strokeLinejoin="round" strokeLinecap="round">
          <path d="M250 860 Q170 860 170 930 Q170 1000 270 1010" stroke={INK} strokeWidth={26} fill="none" />
          <path d="M610 860 Q690 860 690 930 Q690 1000 590 1010" stroke={INK} strokeWidth={26} fill="none" />
          <path d="M240 830 H620 Q620 1040 430 1060 Q240 1040 240 830 Z" fill="#FFCF5C" stroke={INK} strokeWidth={20} />
          <path d="M300 860 Q300 990 400 1020" stroke="#FFF1C2" strokeWidth={18} fill="none" />
          <rect x={405} y={1056} width={50} height={56} fill="#E5A93A" stroke={INK} strokeWidth={18} />
          <rect x={320} y={1106} width={220} height={52} rx={10} fill="#E5A93A" stroke={INK} strokeWidth={20} />
        </g>
      );
    case "telefon":
      return (
        <g transform="rotate(-10 930 960)" strokeLinejoin="round">
          <rect x={820} y={760} width={230} height={400} rx={40} fill={INK} />
          <rect x={842} y={800} width={186} height={320} rx={18} fill={C.mVioletDeep} />
          <path d="M880 960 L990 914 L968 1012 L932 982 L920 1008 L916 974 L972 932 L908 966 Z" fill="#fff" />
          <rect x={900} y={776} width={70} height={10} rx={5} fill="#3B3A55" />
        </g>
      );
    default:
      return null;
  }
};
