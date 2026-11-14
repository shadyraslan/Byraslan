"use client";
import Link from "next/link";

/** لو صفحة وقعت: رسالة بالعربي وزرار يعيد المحاولة بدل الشاشة البيضا — من مراجعة فرع emam (BUG-017) */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card" style={{ maxWidth: 520, margin: "40px auto", display: "grid", gap: 10, textAlign: "center" }}>
      <b style={{ fontSize: 20 }}>حصلت مشكلة في الصفحة دي 😕</b>
      <div className="muted">{error.message?.replace(/^.*?ERROR:\s*/, "") || "جرّب تاني بعد شوية"}</div>
      {error.digest && <div className="muted" dir="ltr" style={{ fontSize: 12 }}>كود المشكلة: {error.digest}</div>}
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn pri" onClick={reset}>جرّب تاني</button>
        <Link className="btn" href="/dashboard" style={{ display: "inline-grid", placeItems: "center" }}>الرئيسية</Link>
      </div>
    </div>
  );
}
