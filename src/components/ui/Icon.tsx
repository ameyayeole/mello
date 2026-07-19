import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { COLORS } from '@/constants/colors';

// Stroke icon set from the Mello design system (Solar Linear-Rounded style).
// stroke-width 1.8 · round caps/joins · never filled.

type Glyph = React.ReactNode;

const glyphs: Record<string, Glyph> = {
  pin: (
    <>
      <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <Circle cx={12} cy={10} r={3} />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <Path d="M4 7h16M10 11v6M14 11v6" />
      <Path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </>
  ),
  megaphone: (
    <>
      <Path d="M3 11v3l14 4V6L3 11Z" />
      <Path d="M17 8a4 4 0 0 1 0 8M7 14.5V19a1.5 1.5 0 0 0 3 0v-3.6" />
    </>
  ),
  bellOff: (
    <>
      <Path d="M8.7 4A6 6 0 0 1 18 8c0 4.5 1.2 7 2 8M6 8c0 7-3 9-3 9h13" />
      <Path d="M13.7 21a2 2 0 0 1-3.4 0M3 3l18 18" />
    </>
  ),
  copy: (
    <>
      <Rect x={9} y={9} width={11} height={11} rx={2} />
      <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  search: (
    <>
      <Circle cx={11} cy={11} r={7} />
      <Path d="m21 21-4.3-4.3" />
    </>
  ),
  bell: (
    <>
      <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  chat: <Path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z" />,
  user: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  userPlus: (
    <>
      <Circle cx={9} cy={8} r={3.5} />
      <Path d="M2 20a7 7 0 0 1 14 0" />
      <Path d="M18 8v6M21 11h-6" />
    </>
  ),
  calendar: (
    <>
      <Rect x={3} y={5} width={18} height={16} rx={3} />
      <Path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  heart: (
    <Path d="M12 20s-7-4.6-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 3.5C19 15.4 12 20 12 20Z" />
  ),
  location: (
    <>
      <Path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Z" />
      <Circle cx={12} cy={10} r={2.5} />
    </>
  ),
  // Google-Maps-style "my location" crosshair: ring + centre dot + N/E/S/W ticks.
  crosshair: (
    <>
      <Circle cx={12} cy={12} r={7} />
      <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <Circle cx={12} cy={12} r={1.4} fill="currentColor" />
    </>
  ),
  filter: <Path d="M3 5h18M6 12h12M10 19h4" />,
  bookmark: <Path d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2Z" />,
  // fill="currentColor" resolves to the Svg's color prop (set in Icon below).
  bookmarkFilled: (
    <Path
      d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2Z"
      fill="currentColor"
    />
  ),
  refresh: <Path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />,
  undo: <Path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 1 1 0 11H11" />,
  chevronRight: <Path d="m9 6 6 6-6 6" />,
  chevronDown: <Path d="m6 9 6 6 6-6" />,
  back: <Path d="M15 18l-6-6 6-6" />,
  check: <Path d="m5 13 4 4L19 7" />,
  checkDouble: (
    <>
      <Path d="m2 13 4 4L15 8" />
      <Path d="m9.5 14.5 2.5 2.5L22 8" />
    </>
  ),
  close: <Path d="M6 6 18 18M18 6 6 18" />,
  send: <Path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />,
  share: (
    <>
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </>
  ),
  mic: (
    <>
      <Rect x={9} y={3} width={6} height={11} rx={3} />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  camera: (
    <>
      <Path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <Circle cx={12} cy={12.5} r={3.5} />
    </>
  ),
  settings: (
    <>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ),
  thumbsUp: (
    <Path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 4.5-8a2 2 0 0 1 2.8 2.4L13 9h5.5a2 2 0 0 1 2 2.5l-1.8 7a2 2 0 0 1-2 1.5H7" />
  ),
  clock: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 2" />
    </>
  ),
  shield: (
    <>
      <Path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z" />
      <Path d="m9 12 2 2 4-4" />
    </>
  ),
  edit: (
    <Path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3ZM13.5 6.5l3 3" />
  ),
  logout: (
    <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  ),
  globe: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M3 12h18M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18" />
    </>
  ),
  lock: (
    <>
      <Rect x={4} y={10} width={16} height={11} rx={2.5} />
      <Path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  help: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M9.5 9.5a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3" />
      <Circle cx={12} cy={16.5} r={0.4} />
    </>
  ),
  block: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M5.5 5.5l13 13" />
    </>
  ),
  dots: (
    <Path d="M12 5.2v.1M12 12v.1M12 18.8v.1" strokeWidth={2.8} />
  ),
  phone: (
    <Path d="M22 16.9v2a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 4.2 2 2 0 0 1 5.1 2h2a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.25a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7a2 2 0 0 1 1.7 2Z" />
  ),
  warning: (
    <>
      <Path d="M10.3 4.6 2.9 18a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z" />
      <Path d="M12 9v4M12 17h.01" />
    </>
  ),
  flag: <Path d="M5 21V4M5 4h13l-2.5 4L18 12H5" />,
  crown: (
    <>
      <Path d="M3 8.5 7 12l5-6.5L17 12l4-3.5-1.6 9a2 2 0 0 1-2 1.5H6.6a2 2 0 0 1-2-1.5L3 8.5Z" />
    </>
  ),
  shieldAlert: (
    <>
      <Path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z" />
      <Path d="M12 8v4M12 15.5h.01" />
    </>
  ),
  eye: (
    <>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <Circle cx={12} cy={12} r={3} />
    </>
  ),
  eyeOff: (
    <>
      <Path d="M9.9 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.5 17.5 0 0 1-2.2 3M14.1 14.1a3 3 0 0 1-4.2-4.2M6.6 6.6C4 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.5 0 2.9-.4 4.1-1.1" />
      <Path d="M3 3l18 18" />
    </>
  ),
  image: (
    <>
      <Rect x={3} y={4} width={18} height={16} rx={3} />
      <Path d="m3 16 5-5 4 4 3-3 6 6" />
      <Circle cx={15.5} cy={9} r={1.5} />
    </>
  ),
  qr: (
    <>
      <Rect x={3} y={3} width={7} height={7} rx={1.5} />
      <Rect x={14} y={3} width={7} height={7} rx={1.5} />
      <Rect x={3} y={14} width={7} height={7} rx={1.5} />
      <Path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17.5 21H21v-3.5" />
    </>
  ),
  scan: (
    <>
      <Path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
      <Path d="M3 12h18" />
    </>
  ),
  // Category glyphs
  coffee: (
    <>
      <Path d="M5 8h12v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8Z" />
      <Path d="M17 9h2a2 2 0 0 1 0 4h-2" />
      <Path d="M8 2v2M12 2v2" />
    </>
  ),
  drinks: (
    <>
      <Path d="M5 4h14l-7 8Z" />
      <Path d="M12 12v6M8.5 20h7" />
    </>
  ),
  music: (
    <>
      <Circle cx={6.5} cy={18} r={2.5} />
      <Circle cx={17.5} cy={16} r={2.5} />
      <Path d="M9 18V7l11-2v9" />
    </>
  ),
  trekking: (
    <>
      <Path d="m2 19 6-9 4 5 2.5-3.5L20 19Z" />
      <Circle cx={17} cy={6} r={2} />
    </>
  ),
  gym: <Path d="M6.5 8v8M3.5 10v4M17.5 8v8M20.5 10v4M6.5 12h11" />,
  study: (
    <>
      <Path d="M5 4a2 2 0 0 1 2-2h11v15H7a2 2 0 0 0-2 2V4Z" />
      <Path d="M5 19a2 2 0 0 1 2-2h11" />
    </>
  ),
  parties: (
    <Path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
  ),
  gaming: (
    <>
      <Rect x={2.5} y={8.5} width={19} height={8} rx={4} />
      <Path d="M7.5 11v3M6 12.5h3" />
      <Circle cx={16} cy={12} r={0.9} />
      <Circle cx={18} cy={14} r={0.9} />
    </>
  ),
};

export type IconName = keyof typeof glyphs;

// True when a hand-drawn SVG glyph exists for this name. Category tiles use
// this to fall back to the activity's emoji for types without a glyph yet.
export function hasGlyph(name: string): name is IconName {
  return name in glyphs;
}

export function Icon({
  name,
  size = 20,
  color = COLORS.textPrimary,
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      color={color}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyphs[name]}
    </Svg>
  );
}

// Blue filled circle with white check — next to names, on avatars.
export function VerifiedBadge({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={11} fill={COLORS.verified} />
      <Path
        d="M7.6 12.3l2.9 2.9 5.9-6.3"
        stroke="#fff"
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Gold filled circle with white crown — marks Mello+ members next to names.
export function PremiumBadge({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={11} fill="#C9930A" />
      <Path
        d="M6.2 9.4 8.9 11.6 12 7.6l3.1 4 2.7-2.2-1.1 6a1.3 1.3 0 0 1-1.3 1H7.6a1.3 1.3 0 0 1-1.3-1l-1.1-6Z"
        fill="#fff"
      />
    </Svg>
  );
}

// Filled tab-bar icons (design shows solid glyphs, icon-only nav).
export function TabGlyph({
  name,
  active,
  size = 25,
}: {
  name: 'home' | 'explore' | 'map' | 'inbox';
  active: boolean;
  size?: number;
}) {
  const fill = active ? COLORS.primary : 'rgba(15,24,44,0.22)';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && (
        <Path
          d="M11.3 2.3a1 1 0 0 1 1.4 0l8.7 8.2c.4.3.6.8.6 1.3v8.2a1 1 0 0 1-1 1h-5v-5H9v5H4a1 1 0 0 1-1-1v-8.2c0-.5.2-1 .6-1.3l7.7-7.2Z"
          fill={fill}
        />
      )}
      {name === 'explore' && (
        <>
          <Circle cx={12} cy={12} r={10} fill={fill} />
          <Path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" fill="rgba(255,255,255,0.75)" />
        </>
      )}
      {name === 'map' && (
        <>
          <Path
            d="M12 2a7 7 0 0 1 7 7c0 5.5-7 13-7 13S5 14.5 5 9a7 7 0 0 1 7-7Z"
            fill={fill}
          />
          <Circle cx={12} cy={9} r={2.8} fill="#fff" />
        </>
      )}
      {name === 'inbox' && (
        <Path
          d="M12 3a9 9 0 0 1 9 9 8.99 8.99 0 0 1-9 9 8.96 8.96 0 0 1-4.58-1.25L3 21l1.25-4.42A8.96 8.96 0 0 1 3 12a9 9 0 0 1 9-9Z"
          fill={fill}
        />
      )}
    </Svg>
  );
}
