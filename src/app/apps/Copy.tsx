"use client";
import { useState } from "react";
export default function Copy({ url, label = "انسخ لينك التنزيل" }: { url: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="cp" onClick={async () => {
      const full = new URL(url, location.href).toString();
      try { await navigator.clipboard.writeText(full); } catch { prompt("انسخ اللينك:", full); }
      setOk(true); setTimeout(() => setOk(false), 1500);
    }}>{ok ? "اتنسخ ✓" : label}</button>
  );
}
