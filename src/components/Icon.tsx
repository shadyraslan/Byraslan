/** أيقونات خطية بسيطة (24×24) — من غير مكتبات خارجية */
const P: Record<string, string> = {
  home: "M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5",
  sales: "M2 3h3l2.6 12.4h11L21 7H6.2M9 20.5h.01M18 20.5h.01",
  purchase: "M6 2h12l2 5H4zM4 7v13h16V7M9 11h6",
  stock: "M3 21V9l9-6 9 6v12M7 21v-8h10v8M7 17h10",
  factory: "M3 21V10l6 4v-4l6 4V5l6-2v18zM7 18h2M12 18h2M17 18h2",
  truck: "M1 5h13v11H1zM14 9h4.5L22 12.5V16h-8M5.5 19.5a1.5 1.5 0 1 0 0-.01M17.5 19.5a1.5 1.5 0 1 0 0-.01",
  accounts: "M4 2h16v20H4zM8 6h8v3H8zM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01",
  hr: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5M16 3.5a4 4 0 0 1 0 7.5M22 21c0-3-1.6-5.2-4-6.1",
  reports: "M3 21h18M6 17v-6M11 17V5M16 17v-9M21 17v-3",
  settings: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4",
  items: "M3 12V3h9l9 9-9 9zM7.5 7.5h.01",
  pin: "M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  shield: "M12 2l8 3v6c0 5.2-3.4 9.3-8 11-4.6-1.7-8-5.8-8-11V5zM9 12l2 2 4-4",
  pos: "M3 7V4h3M18 4h3v3M21 17v3h-3M6 20H3v-3M7 8v8M10 8v8M13.5 8v8M17 8v8",
  app: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  store: "M3 9l2-5h14l2 5M3 9h18M4 9v12h16V9M9 21v-6h6v6",
  heart: "M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z",
  trash: "M3 6h18M8 6V3h8v3M5.5 6l1 15h11l1-15M10 10v7M14 10v7",
  transfer: "M4 8h15l-4-4M20 16H5l4 4",
  count: "M6 4h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 4V2h6v2M9 13l2 2 4-4",
  box: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  orders: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6",
  tag: "M20 12l-8 8-8-8V4h8zM8 8h.01",
  partner: "M8 12l3 3 6-6M2 12l5-5 4 2 4-2 7 5-8 8z",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
};

export default function Icon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name] ?? P.box} />
    </svg>
  );
}
