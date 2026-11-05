"use client";
import { photoUrl } from "@/lib/img";
export default function Receipt({ path }: { path: string }) {
  return <button className="btn" style={{ height: 32 }} onClick={async () => { const u = await photoUrl(path); if (u) window.open(u, "_blank"); }}>🧾</button>;
}
