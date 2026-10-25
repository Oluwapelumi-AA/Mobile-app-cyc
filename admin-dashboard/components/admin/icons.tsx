import type { SVGProps } from "react";

/**
 * Inline line icons (lucide-style, 24px grid, 1.8 stroke).
 * Kept in-repo so the dashboard needs no icon dependency.
 */
const paths = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  flag: (
    <>
      <path d="M4 22V4" />
      <path d="M4 4h11l-1.5 4L15 12H4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14a6.5 6.5 0 0 1 3.5 6" />
    </>
  ),
  community: (
    <>
      <circle cx="12" cy="7" r="3" />
      <circle cx="5" cy="10" r="2.3" />
      <circle cx="19" cy="10" r="2.3" />
      <path d="M7 20a5 5 0 0 1 10 0" />
      <path d="M1.5 19a3.6 3.6 0 0 1 4.7-3.4" />
      <path d="M22.5 19a3.6 3.6 0 0 0-4.7-3.4" />
    </>
  ),
  message: (
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4z" />
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M7.5 14h2M11 14h2M14.5 14h2M7.5 17.5h2M11 17.5h2" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="m15.5 10.5 6-3.5v10l-6-3.5" />
    </>
  ),
  book: (
    <>
      <path d="M2.5 5.5c3-1.5 6-1.5 9.5.5v14c-3.5-2-6.5-2-9.5-.5z" />
      <path d="M21.5 5.5c-3-1.5-6-1.5-9.5.5v14c3.5-2 6.5-2 9.5-.5z" />
    </>
  ),
  cap: (
    <>
      <path d="m12 4 10 5-10 5L2 9z" />
      <path d="M6 11v5c3.5 2.7 8.5 2.7 12 0v-5" />
      <path d="M22 9v6" />
    </>
  ),
  branch: (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="5" cy="19" r="2.5" />
      <circle cx="19" cy="19" r="2.5" />
      <path d="M12 7.5v4M12 11.5 6.3 17M12 11.5l5.7 5.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  file: (
    <>
      <path d="M6 2.5h8.5L19.5 7.5v12A2 2 0 0 1 17.5 21.5h-11a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2z" />
      <path d="M14 2.5v5.5h5.5M8.5 13h7M8.5 17h5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.5-4.5" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  sort: <path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" />,
  more: (
    <>
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  moreH: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8 12.5 3 3 5-6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  hourglass: <path d="M6 2.5h12M6 21.5h12M7 2.5c0 5 5 6 5 9.5s-5 4.5-5 9.5M17 2.5c0 5-5 6-5 9.5s5 4.5 5 9.5" />,
  ban: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m5.3 5.3 13.4 13.4" />
    </>
  ),
  download: <path d="M12 3v12M7 10l5 5 5-5M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" />,
  upload: <path d="M12 15V3M7 8l5-5 5 5M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" />,
  trash: <path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 14h10l1-14M10 10.5v6M14 10.5v6" />,
  edit: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4" />,
  copy: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="2.5" />
      <path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21.5s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
    </>
  ),
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  heart: <path d="M12 20.5S3 15 3 8.8A4.8 4.8 0 0 1 12 6.5a4.8 4.8 0 0 1 9 2.3C21 15 12 20.5 12 20.5z" />,
  thumbsUp: <path d="M7 10v11M7 10l4-7.5a2 2 0 0 1 3 1.8L13.5 9H19a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 17.6 21H7M3 10h4v11H3z" />,
  broadcast: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m10 8.5 5.5 3.5-5.5 3.5z" />
    </>
  ),
  stopCircle: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  mail: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="m3 6.5 9 6.5 9-6.5" />
    </>
  ),
  send: <path d="M21.5 2.5 10 14M21.5 2.5 14.5 21.5 10 14 2.5 9.5z" />,
  megaphone: <path d="M3 10v4a1 1 0 0 0 1 1h3l9 5V4L7 9H4a1 1 0 0 0-1 1zM7 15l1.5 5.5M19 9.5a3 3 0 0 1 0 5" />,
  pointer: <path d="m4 4 6.5 16 2.2-6.8L19.5 11zM13 13l6 6" />,
  shield: <path d="M12 2.5 4 5.5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10v-6z" />,
  shieldCheck: (
    <>
      <path d="M12 2.5 4 5.5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10v-6z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="3" width="18" height="8" rx="2" />
      <rect x="3" y="13" width="18" height="8" rx="2" />
      <path d="M7 7h.01M7 17h.01" />
    </>
  ),
  cloud: <path d="M7 19a5 5 0 0 1-.8-9.9A6.5 6.5 0 0 1 18.6 8 5.5 5.5 0 0 1 17.5 19z" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.6-4.5L3.5 9M3.5 4v5h5M4 13a8 8 0 0 0 14.6 4.5l1.9-2.5M20.5 20v-5h-5" />,
  rotate: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />,
  creditCard: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19M6.5 15h4" />
    </>
  ),
  barChart: <path d="M5 21V12M12 21V4M19 21v-6" />,
  logout: <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10 16.5 5.5 12 10 7.5M5.5 12H15" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  phone: <path d="M5 3.5h3.5l2 5-2.5 1.5a11 11 0 0 0 6 6l1.5-2.5 5 2V19a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2" />,
  badgeCheck: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="m8 12.5 3 3 5-6" />
    </>
  ),
  layers: <path d="m12 2.5 10 5-10 5-10-5zM2 12.5l10 5 10-5M2 17l10 5 10-5" />,
  award: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="m8.5 14 -1.5 8 5-3 5 3-1.5-8" />
    </>
  ),
  fileText: (
    <>
      <path d="M6 2.5h8.5L19.5 7.5v12A2 2 0 0 1 17.5 21.5h-11a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2z" />
      <path d="M14 2.5v5.5h5.5M8.5 12.5h7M8.5 16h7" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M2.5 12h19M12 2.5c2.6 2.8 3.8 6 3.8 9.5S14.6 18.7 12 21.5C9.4 18.7 8.2 15.5 8.2 12S9.4 5.3 12 2.5z" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10.5" width="16" height="11" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </>
  ),
  palette: (
    <>
      <path d="M12 21.5a9.5 9.5 0 1 1 9.5-9.5c0 2.6-2.1 3.5-4 3.5h-2a2 2 0 0 0-1.5 3.3 1.6 1.6 0 0 1-1.2 2.7z" />
      <circle cx="7.5" cy="11" r="1.2" />
      <circle cx="11" cy="7" r="1.2" />
      <circle cx="16" cy="8" r="1.2" />
    </>
  ),
  link: <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />,
  filter: <path d="M3 4.5h18l-7 8.5v6.5l-4 2V13z" />,
  volumeOff: <path d="M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6" />,
  userPlus: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" />
    </>
  ),
  cross: <path d="M12 2.5v19M6 8.5h12" />,
} as const;

export type IconName = keyof typeof paths;

type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  size?: number;
  strokeWidth?: number;
};

export function Icon({ name, size = 20, strokeWidth = 1.8, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

/** The CYC mark: a ring of red petals around a centre dot. */
export function CycLogo({ size = 44 }: { size?: number }) {
  const petals = Array.from({ length: 8 }, (_, i) => i);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {petals.map((i) => {
        const angle = (i / petals.length) * Math.PI * 2 - Math.PI / 2;
        const cx = 24 + Math.cos(angle) * 15;
        const cy = 24 + Math.sin(angle) * 15;
        return (
          <ellipse
            key={i}
            cx={cx}
            cy={cy}
            rx={i % 2 ? 5.2 : 6.2}
            ry={i % 2 ? 5.2 : 6.2}
            fill={i % 2 ? "#c62828" : "#860000"}
          />
        );
      })}
      <circle cx="24" cy="24" r="5.5" fill="#860000" />
    </svg>
  );
}
