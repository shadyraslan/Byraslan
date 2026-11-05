import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/perms";
import { signOut } from "./actions";

const NAV: [string, [string, string][]][] = [
  ["", [["/dashboard", "الرئيسية"]]],
  ["المصنع والمخزون", [["/pack", "محطة التغليف"], ["/stock", "المخزون"], ["/transfers", "التحويلات"]]],
  ["الأصناف", [["/items", "الأصناف والعائلات"]]],
  ["الإعداد", [["/locations", "المواقع"], ["/users", "المستخدمين والصلاحيات"]]],
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  return (
    <div className="shell">
      <nav className="side">
        <div className="brand"><img src="/logo.png" alt="By Raslan" /><span style={{ fontSize: 10.5, letterSpacing: 2, color: "#f5c800" }}>ERP</span></div>
        {NAV.map(([g, links]) => (
          <div key={g || "home"} style={{ display: "contents" }}>
            {g && <div className="grp">{g}</div>}
            {links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <form action={signOut}><button className="btn" style={{ width: "100%" }}>خروج — {me.name}</button></form>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
