"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "./actions";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await signIn(email, password);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} className="card" style={{ width: "100%", maxWidth: 360, display: "grid", gap: 12 }}>
        <div style={{ background: "#000", borderRadius: 14, display: "grid", placeItems: "center", padding: "14px 0 10px" }}>
          <img src="/logo.png" alt="By Raslan" style={{ width: 170, height: "auto" }} />
        </div>
        <label className="fld">اسم المستخدم<input type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required dir="auto" /></label>
        <label className="fld">الرقم السري<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" /></label>
        {err && <div className="err">{err}</div>}
        <button className="btn pri" disabled={busy}>{busy ? "..." : "دخول"}</button>
      </form>
    </main>
  );
}
