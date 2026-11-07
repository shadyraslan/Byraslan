"use client";
import { photoUrl } from "@/lib/img";
export default function Photo({ path }: { path: string }) {
  return <button type="button" className="btn" style={{ height: 28 }} onClick={async () => { const u = await photoUrl(path, "hr"); if (u) window.open(u, "_blank"); }}>📷 الصورة</button>;
}
