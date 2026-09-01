/** Line icons in the reference sheet's register: thin strokes, round caps. */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const wrap = (children: React.ReactNode, size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S} aria-hidden>
    {children}
  </svg>
);

export const Feather = ({ size = 20 }) =>
  wrap(
    <>
      <path d="M20.2 4.1c-1.6-1.6-5.1-1-8 1.9-2.2 2.2-3 4.6-3.6 7.1L6 16l2.9 2.9 2.9-2.6c2.5-.6 4.9-1.4 7.1-3.6 2.9-2.9 3.5-6.4 1.9-8Z" />
      <path d="M6 18 3.5 20.5" />
      <path d="M16 8 9.5 14.5" />
    </>,
    size,
  );

export const Users = ({ size = 20 }) => wrap(<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 5.5a3 3 0 0 1 0 5.8" /><path d="M17.5 15c2.1.5 3.5 2 3.5 5" /></>, size);
export const Pin = ({ size = 20 }) => wrap(<><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>, size);
export const Chart = ({ size = 20 }) => wrap(<><path d="M3 16l5-6 4 3 6-8" /><circle cx="8" cy="10" r="1.4" /><circle cx="12" cy="13" r="1.4" /><circle cx="18" cy="5" r="1.4" /></>, size);
export const List = ({ size = 20 }) => wrap(<><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></>, size);
export const Chat = ({ size = 20 }) => wrap(<><path d="M4 5.5h16v10H9l-5 4V5.5Z" /><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" /></>, size);
export const Bulb = ({ size = 20 }) => wrap(<><path d="M9.5 17h5" /><path d="M10 20h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3Z" /></>, size);
export const Note = ({ size = 20 }) => wrap(<><path d="M6 3h8l4 4v14H6Z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h4" /></>, size);
export const Bookmark = ({ size = 20 }) => wrap(<><path d="M7 3h10v18l-5-4-5 4Z" /></>, size);
export const Target = ({ size = 20 }) => wrap(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" /><path d="M12 4V2M12 22v-2M4 12H2M22 12h-2" /></>, size);
export const Bars = ({ size = 20 }) => wrap(<><path d="M5 20V12M12 20V5M19 20v-6" /><path d="M3 20h18" /></>, size);
export const Layers = ({ size = 20 }) => wrap(<><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="M3 13.5 12 18l9-4.5" /></>, size);
export const Clock = ({ size = 20 }) => wrap(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>, size);
export const Book = ({ size = 20 }) => wrap(<><path d="M12 6.5S10 4.5 4 4.5v13c6 0 8 2 8 2s2-2 8-2v-13c-6 0-8 2-8 2Z" /><path d="M12 6.5v13" /></>, size);
export const Dots = ({ size = 18 }) => wrap(<><circle cx="12" cy="5.5" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="12" cy="18.5" r="1.3" /></>, size);
export const Expand = ({ size = 16 }) => wrap(<><path d="M9 4H4v5M15 20h5v-5M20 9V4h-5M4 15v5h5" /></>, size);
export const Minus = ({ size = 16 }) => wrap(<path d="M5 12h14" />, size);
export const Close = ({ size = 16 }) => wrap(<path d="M6 6l12 12M18 6 6 18" />, size);
export const Cloud = ({ size = 18 }) => wrap(<path d="M7 18h9.5a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 6.3 9.6 4.2 4.2 0 0 0 7 18Z" />, size);
export const Spark = ({ size = 16 }) => wrap(<path d="M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.8L12 3.5Z" />, size);
export const Arrow = ({ size = 16 }) => wrap(<><path d="M4 12h15" /><path d="M14 7l5 5-5 5" /></>, size);
