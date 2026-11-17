"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { setPhoto } from "./actions";

/** صورة الصنف اللي بتظهر في التطبيق (باكت عام) */
export default function Photo({ item, photo, code }: { item: number; photo: string | null; code: string }) {
  const [url, setUrl] = useState(photo);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const up = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setErr("الملف ده مش صورة");
    setBusy(true); setErr(null);
    const path = `${code}-${Date.now()}.${(f.name.split(".").pop() || "jpg").toLowerCase()}`;
    const sb = supabaseBrowser();
    const { error } = await sb.storage.from("items").upload(path, f, { contentType: f.type, upsert: true });
    if (error) { setBusy(false); return setErr(error.message); }
    const u = sb.storage.from("items").getPublicUrl(path).data.publicUrl;
    await setPhoto(item, u); setUrl(u); setBusy(false);
  };
  return (
    <div className="row" style={{ alignItems: "center" }}>
      {url ? <img src={url} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 12 }} /> : <div className="muted" style={{ width: 90, height: 90, display: "grid", placeItems: "center", border: "1px dashed var(--line)", borderRadius: 12 }}>مفيش صورة</div>}
      <label className="btn" style={{ cursor: "pointer", display: "inline-grid", placeItems: "center" }}>{busy ? "بيترفع…" : url ? "غيّر الصورة" : "ارفع صورة"}<input type="file" accept="image/*" hidden onChange={(e) => up(e.target.files?.[0])} /></label>
      {err && <span className="badmsg">{err}</span>}
    </div>
  );
}
