import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "كاشير باي رسلان", manifest: "/cashier.webmanifest", icons: { icon: "/icon.png", apple: "/icon.png" } };
export const viewport: Viewport = { themeColor: "#0D0D0D" };

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  return children;
}
