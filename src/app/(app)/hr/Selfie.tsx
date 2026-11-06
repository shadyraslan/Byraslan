"use client";
import { useState } from "react";
import { photoUrl } from "@/lib/img";
/** صورة متشالة في فولدر الموارد البشرية (سيلفي، فاتورة عهدة، ورقة) — بتتفتح لما تدوس */
export default function Selfie({ path, label = "🤳 السيلفي", link }: { path: string; label?: string; link?: boolean }) {
  const [u, setU] = useState<string | null>(null);
  if (link) return <button className="btn" style={{ height: 32 }} onClick={async () => { const x = await photoUrl(path, "hr"); if (x) window.open(x, "_blank"); }}>{label}</button>;
  if (u) return <a href={u} target="_blank" rel="noreferrer"><img src={u} alt={label} style={{ width: 120, height: 150, objectFit: "cover", borderRadius: 10 }} /></a>;
  return <button className="btn" style={{ height: 32 }} onClick={async () => setU(await photoUrl(path, "hr"))}>{label}</button>;
}
