"use client";
import { useState } from "react";
import { photoUrl } from "@/lib/img";
export default function Selfie({ path }: { path: string }) {
  const [u, setU] = useState<string | null>(null);
  if (u) return <img src={u} alt="سيلفي" style={{ width: 120, height: 150, objectFit: "cover", borderRadius: 10 }} />;
  return <button className="btn" style={{ height: 32 }} onClick={async () => setU(await photoUrl(path, "hr"))}>🤳 السيلفي</button>;
}
