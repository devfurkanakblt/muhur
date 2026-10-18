import { BODY_FILL, BODY_INK, CIRCUIT_LINES } from "./paths";

export type MascotMood =
  | "normal"
  | "mutlu"
  | "merakli"
  | "odakli"
  | "uykulu"
  | "heyecanli"
  | "hackathon"
  | "pizza"
  | "kahve"
  | "kalp"
  | "durbun"
  | "oyun";

const INK = "#00051D";
const FILL = "#FBF6F8";
const BLUSH = "#FECCD7";
const VIOLET_DEEP = "#523BD3";
const VIOLET = "#8466F3";

// Yüz geometrisi paftadaki ana karakterden ölçüldü (4x koordinat).
const EYE_L = { cx: 528.5, cy: 658, w: 71, h: 130 };
const EYE_R = { cx: 769, cy: 657.5, w: 68, h: 129 };
const STROKE = { stroke: INK, strokeWidth: 20, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

function Eyes({ mood }: { mood: MascotMood }) {
  switch (mood) {
    case "mutlu":
    case "pizza":
      return (
        <g {...STROKE} strokeWidth={22}>
          <path d="M490 676 Q528 600 566 676" />
          <path d="M731 676 Q769 600 807 676" />
        </g>
      );
    case "uykulu":
      return (
        <g {...STROKE} strokeWidth={20}>
          <path d="M492 650 Q528 700 564 650" />
          <path d="M733 650 Q769 700 805 650" />
        </g>
      );
    case "heyecanli":
      return (
        <g {...STROKE} strokeWidth={24}>
          <path d="M494 612 L566 656 L494 700" />
          <path d="M805 612 L733 656 L805 700" />
        </g>
      );
    case "odakli":
      return (
        <g>
          <rect x={352} y={566} width={600} height={34} rx={14} fill={INK} />
          <path
            d="M370 590 H636 L622 712 Q616 752 576 752 H436 Q396 752 388 714 Z"
            fill={INK}
          />
          <path
            d="M668 590 H934 L916 714 Q908 752 868 752 H728 Q688 752 682 712 Z"
            fill={INK}
          />
          <path d="M430 628 L486 628 M726 628 L782 628" stroke="#3B3A55" strokeWidth={16} strokeLinecap="round" />
        </g>
      );
    case "durbun":
      // Kollar gövdenin önünden kalkar, eller dürbünü alttan kavrar; dürbün hafif eğik, ağız merakla açık: vitrini izlemek üzere.
      return (
        <g strokeLinejoin="round" strokeLinecap="round">
          <path d="M318 958 Q330 846 438 778" stroke={INK} strokeWidth={36} fill="none" />
          <path d="M984 952 Q972 840 864 776" stroke={INK} strokeWidth={36} fill="none" />
          <g transform="rotate(-6 650 652)">
            <rect x={600} y={590} width={100} height={56} rx={16} fill={INK} />
            <path d="M650 556 V600" stroke={INK} strokeWidth={22} />
            {[EYE_L.cx, EYE_R.cx].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy={652} r={104} fill={VIOLET_DEEP} stroke={INK} strokeWidth={18} />
                <circle cx={cx} cy={652} r={64} fill="#DCE6FF" stroke={INK} strokeWidth={14} />
                <path d={`M${cx - 34} ${636} Q${cx - 24} ${612} ${cx} ${606}`} stroke="#FFFFFF" strokeWidth={14} fill="none" />
              </g>
            ))}
            {/* Eldiven biçiminde eller, dürbünün alt kenarını kavrar. */}
            {[
              { cx: 452, flip: 1 },
              { cx: 846, flip: -1 },
            ].map(({ cx, flip }) => (
              <g key={cx}>
                <ellipse cx={cx} cy={738} rx={56} ry={46} fill={FILL} stroke={INK} strokeWidth={16} />
                <path d={`M${cx - 18 * flip} 712 Q${cx + 4 * flip} 704 ${cx + 22 * flip} 716`} stroke={INK} strokeWidth={10} fill="none" />
                <path d={`M${cx - 20 * flip} 736 Q${cx + 2 * flip} 728 ${cx + 24 * flip} 740`} stroke={INK} strokeWidth={10} fill="none" />
              </g>
            ))}
          </g>
        </g>
      );
    case "oyun":
      // Kaşlar çatık, gözler aşağıda oyun kolunda: rekabet ciddi.
      return (
        <g>
          <g fill={INK}>
            <rect x={EYE_L.cx - EYE_L.w / 2} y={EYE_L.cy - 40} width={EYE_L.w} height={104} rx={EYE_L.w / 2} />
            <rect x={EYE_R.cx - EYE_R.w / 2} y={EYE_R.cy - 40} width={EYE_R.w} height={104} rx={EYE_R.w / 2} />
          </g>
          <g {...STROKE} strokeWidth={22}>
            <path d="M484 566 L572 594" />
            <path d="M813 566 L725 594" />
          </g>
        </g>
      );
    case "kalp":
      return (
        <g>
          <path d="M490 676 Q528 600 566 676" {...STROKE} strokeWidth={22} />
          <rect x={EYE_R.cx - EYE_R.w / 2} y={EYE_R.cy - EYE_R.h / 2} width={EYE_R.w} height={EYE_R.h} rx={EYE_R.w / 2} fill={INK} />
        </g>
      );
    default:
      return (
        <g fill={INK}>
          <rect x={EYE_L.cx - EYE_L.w / 2} y={EYE_L.cy - EYE_L.h / 2} width={EYE_L.w} height={EYE_L.h} rx={EYE_L.w / 2} />
          <rect x={EYE_R.cx - EYE_R.w / 2} y={EYE_R.cy - EYE_R.h / 2} width={EYE_R.w} height={EYE_R.h} rx={EYE_R.w / 2} />
        </g>
      );
  }
}

function Mouth({ mood }: { mood: MascotMood }) {
  if (mood === "durbun") return <ellipse cx={649} cy={806} rx={20} ry={24} fill={INK} />;
  if (mood === "pizza") return <ellipse cx={649} cy={778} rx={24} ry={28} fill={INK} />;
  if (mood === "heyecanli") return <path d="M626 752 Q649 790 672 752" {...STROKE} strokeWidth={18} />;
  if (mood === "oyun")
    return (
      <g>
        <path d="M660 772 Q666 820 692 816 Q714 812 702 768 Z" fill="#E8536B" stroke={INK} strokeWidth={12} strokeLinejoin="round" />
        <path d="M612 756 Q649 796 700 760" {...STROKE} strokeWidth={18} />
      </g>
    );
  if (mood === "mutlu") return <path d="M604 752 Q649 812 694 752" {...STROKE} strokeWidth={20} />;
  return <path d="M618 760 Q649 800 680 760" {...STROKE} strokeWidth={18} />;
}

function Extras({ mood }: { mood: MascotMood }) {
  switch (mood) {
    case "merakli":
      return (
        <g data-mascot-extra>
          <path d="M150 196 Q150 120 222 120 Q292 120 292 186 Q292 230 246 252 Q222 264 222 300" {...STROKE} strokeWidth={30} />
          <circle cx={222} cy={352} r={20} fill={INK} />
        </g>
      );
    case "uykulu":
      return (
        <g data-mascot-extra {...STROKE} strokeWidth={22}>
          <path d="M90 250 H150 L90 314 H150" />
          <path d="M190 128 H270 L190 214 H270" />
        </g>
      );
    case "heyecanli":
      return (
        <g data-mascot-extra stroke={VIOLET} strokeWidth={32} strokeLinecap="round">
          <path d="M166 186 L214 270" />
          <path d="M52 312 L142 350" />
        </g>
      );
    default:
      return null;
  }
}

function Headband() {
  return (
    <g>
      <clipPath id="mascot-head">
        <path d={BODY_FILL} />
      </clipPath>
      <path d="M60 540 Q520 260 1100 300" stroke={VIOLET_DEEP} strokeWidth={96} fill="none" clipPath="url(#mascot-head)" />
    </g>
  );
}

function Pizza() {
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
}

function Gamepad() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path
        d="M500 902 Q500 866 546 866 H754 Q800 866 800 902 L846 1046 Q858 1096 816 1100 Q786 1102 766 1072 L738 1032 H562 L534 1072 Q514 1102 484 1100 Q442 1096 454 1046 Z"
        fill={VIOLET_DEEP}
        stroke={INK}
        strokeWidth={16}
      />
      <path d="M548 940 h22 v-22 h22 v22 h22 v22 h-22 v22 h-22 v-22 h-22 Z" fill={FILL} />
      <circle cx={726} cy={930} r={15} fill="#FFCF5C" />
      <circle cx={756} cy={962} r={15} fill="#E8536B" />
      <path d="M626 916 H674" stroke={VIOLET} strokeWidth={12} />
    </g>
  );
}

function Heart() {
  return (
    <path
      d="M830 1096 C700 1010 632 930 690 858 C736 802 806 816 830 872 C854 816 924 802 970 858 C1028 930 960 1010 830 1096 Z"
      fill="#E8536B"
      stroke={INK}
      strokeWidth={16}
      strokeLinejoin="round"
    />
  );
}

function Mug() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <g stroke="#B9A9FF" strokeWidth={16} fill="none">
        <path d="M766 836 Q744 802 766 768 Q788 734 766 700" />
        <path d="M846 836 Q824 802 846 768 Q868 734 846 700" />
      </g>
      <path d="M944 912 Q1030 912 1030 984 Q1030 1056 944 1056" stroke={INK} strokeWidth={28} fill="none" />
      <rect x={700} y={856} width={250} height={250} rx={32} fill={VIOLET_DEEP} stroke={INK} strokeWidth={16} />
      <rect x={700} y={896} width={250} height={24} fill={VIOLET} />
    </g>
  );
}

function Laptop() {
  return (
    <g>
      <path d="M706 742 L1196 690 Q1214 688 1212 706 L1176 1004 Q1174 1020 1156 1022 L676 1074 Q660 1076 662 1058 L690 760 Q692 744 706 742 Z" fill="#2A2547" />
      <path d="M560 1080 L1150 1018 L1210 1060 L620 1124 Q590 1126 576 1110 Z" fill={INK} />
      <g stroke="#F3F0FF" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M870 852 L834 884 L874 912" />
        <path d="M958 836 L930 924" />
        <path d="M1008 832 L1048 860 L1014 894" />
      </g>
    </g>
  );
}

export function Mascot({
  mood = "normal",
  className,
  style,
  title = "DEÜ CS&AI maskotu",
}: {
  mood?: MascotMood;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  const sq = (x: number, y: number, w: number, h: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={w} height={h} rx={18} fill={VIOLET_DEEP} />
      <rect x={x + w * 0.31} y={y + h * 0.31} width={w * 0.38} height={h * 0.38} rx={6} fill={VIOLET} />
    </g>
  );
  return (
    <svg
      viewBox="20 70 1310 1070"
      className={`mascot ${className ?? ""}`}
      style={style}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
      data-mood={mood}
    >
      <path d={BODY_FILL} fill={FILL} />
      <g fill={BLUSH}>
        <ellipse cx={425.5} cy={741} rx={51} ry={36} />
        <ellipse cx={861} cy={742} rx={53} ry={38} />
      </g>
      <path d={BODY_INK} fill={INK} />
      <path d={CIRCUIT_LINES} fill={VIOLET} />
      {sq(1058, 225, 133, 135)}
      {sq(1190, 428, 125, 129)}
      <rect x={1034} y={916} width={26} height={26} rx={4} fill={VIOLET} />
      {mood === "hackathon" && <Headband />}
      <g data-mascot-face>
        <Eyes mood={mood} />
        {mood !== "hackathon" && <Mouth mood={mood} />}
      </g>
      <Extras mood={mood} />
      {mood === "hackathon" && <Laptop />}
      {mood === "pizza" && <Pizza />}
      {mood === "kahve" && <Mug />}
      {mood === "kalp" && <Heart />}
      {mood === "oyun" && <Gamepad />}
    </svg>
  );
}
