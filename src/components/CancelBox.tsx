"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelThing } from "@/app/(app)/cancellations/actions";

/** زرار «إلغاء» بيفتح خانة السبب (إجباري) — والإلغاء بيوصل للإدارة */
export default function CancelBox({ kind, id, label = "إلغاء", after }: { kind: "trip" | "prod" | "po"; id: number; label?: string; after?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  if (!open) return <button className="btn" style={{ height: 32 }} onClick={() => setOpen(true)}>{label}</button>;
  return (
    <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
      <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="سبب الإلغاء (إجباري)" autoFocus style={{ height: 32, minWidth: 160 }} />
      <button className="btn" style={{ height: 32, background: "var(--bad)", color: "#fff", borderColor: "var(--bad)" }} disabled={pending || why.trim().length < 3}
        onClick={() => start(async () => { const r = await cancelThing(kind, id, why); if (!r.ok) return setErr(r.error); if (after) router.push(after); else router.refresh(); })}>أكّد الإلغاء</button>
      <button className="btn" style={{ height: 32 }} onClick={() => { setOpen(false); setErr(""); }}>رجوع</button>
      {err && <span className="badmsg">{err}</span>}
    </span>
  );
}
