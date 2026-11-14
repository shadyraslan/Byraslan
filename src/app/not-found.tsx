import Link from "next/link";

/** صفحة "مش موجود" بالعربي بدل 404 الإنجليزي */
export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "#F6F5F0", direction: "rtl" }}>
      <div style={{ background: "#fff", border: "2px solid #141410", borderRadius: 22, padding: 24, maxWidth: 420, width: "100%", display: "grid", gap: 10, textAlign: "center" }}>
        <div style={{ background: "#000", borderRadius: 14, padding: "12px 0" }}><img src="/logo.png" alt="By Raslan" style={{ width: 140, height: "auto" }} /></div>
        <b style={{ fontSize: 22 }}>الصفحة دي مش موجودة</b>
        <div style={{ color: "#666" }}>يمكن اللينك قديم أو مكتوب غلط، أو الحاجة اللي بتدوّر عليها اتمسحت أو مش من صلاحيتك.</div>
        <Link href="/dashboard" style={{ background: "#F5C800", border: "2px solid #141410", borderRadius: 999, padding: 10, fontWeight: 900, color: "#141410", textDecoration: "none" }}>ارجع للرئيسية</Link>
        <Link href="/apps" style={{ color: "#555", fontSize: 14 }}>صفحة التطبيقات والروابط</Link>
      </div>
    </main>
  );
}
