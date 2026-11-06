"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { docDecide } from "../pay-actions";

/** تجهيز الورقة: رد + رفع نسخة (PDF أو صورة) اختياري — الموظف بيفتحها من التطبيق */
export default function DocReady({ id, user }: { id: number; user: string }) {
  const [file, setFile] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const up = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(null);
    const ext = (f.name.split(".").pop() || "pdf").toLowerCase();
    const path = `${user}/docs/${id}-${Date.now()}.${ext}`;
    const { error } = await supabaseBrowser().storage.from("hr").upload(path, f, { contentType: f.type || undefined });
    setBusy(false);
    if (error) return setErr(error.message);
    setFile(path);
  };
  return (
    <form action={docDecide} className="row" style={{ gap: 4, alignItems: "center" }}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="file" value={file} />
      <input name="reply" placeholder="رد للموظف (مثلاً: استلمها بكره من HR)" style={{ width: 220, height: 32 }} />
      <label className="btn" style={{ height: 32, display: "inline-grid", placeItems: "center", cursor: "pointer" }}>
        {busy ? "بيترفع…" : file ? "✓ اترفعت" : "📎 ارفع نسخة"}
        <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => up(e.target.files?.[0])} />
      </label>
      <button name="status" value="ready" className="btn pri" style={{ height: 32 }} disabled={busy}>جاهزة</button>
      <button name="status" value="rejected" className="btn" style={{ height: 32 }} disabled={busy}>ارفض</button>
      {err && <span style={{ color: "var(--bad)" }}>{err}</span>}
    </form>
  );
}
