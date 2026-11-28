"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

const weak = (p: string) => p.length < 6 || /^(\d)\1+$/.test(p) || "0123456789".includes(p) || "9876543210".includes(p) || ["123456", "1234567", "12345678", "password", "qwerty"].includes(p.toLowerCase());

export default function ChangeForm() {
  const router = useRouter();
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (weak(a)) return setErr("الرقم السري لازم يبقى ٦ حروف أو أرقام على الأقل، ومايبقاش متسلسل (123456) ولا متكرر (111111)");
    if (a !== b) return setErr("الرقمين مش زي بعض");
    setBusy(true);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) { setBusy(false); return setErr(error.message.includes("same") ? "اختار رقم سري غير القديم" : "ماتغيّرش — جرّب تاني"); }
    await sb.rpc("clear_must_change");
    router.replace("/dashboard"); router.refresh();
  }
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
      <label className="fld">الرقم السري الجديد<input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} required dir="ltr" /></label>
      <label className="fld">اكتبه تاني<input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} required dir="ltr" /></label>
      {err && <div className="badmsg">{err}</div>}
      <button className="btn pri" disabled={busy} style={{ height: 46 }}>{busy ? "…" : "احفظ وادخل"}</button>
    </form>
  );
}
