import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font", display: "swap" });

export const metadata: Metadata = { title: "باي رسلان — ERP", description: "روستوز · رسلان ماركت · أوريتشي", icons: { icon: "/icon.png", apple: "/icon.png" } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('by-raslan-dashboard-theme');if(t==='dark'||t==='light'||t==='image')document.documentElement.dataset.theme=t}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
