"use client";
import { useState } from "react";
export default function Copy({ url }: { url: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="cp" onClick={async () => {
      const full = new URL(url, location.href).toString();
      try { await navigator.clipboard.writeText(full); } catch { prompt("انسخ اللينك:", full); }
      setOk(true); setTimeout(() => setOk(false), 1500);
    }}>{ok ? "اتنسخ ✓" : "انسخ لينك التنزيل"}</button>
  );
}
