import { supabaseServer } from "@/lib/supabase/server";
import { getMe } from "@/lib/perms";

export default async function Dashboard() {
  const me = await getMe();
  const sb = await supabaseServer();
  const [{ count: locs }, { count: items }, { count: users }] = await Promise.all([
    sb.from("locations").select("*", { count: "exact", head: true }),
    sb.from("items").select("*", { count: "exact", head: true }),
    sb.from("profiles").select("*", { count: "exact", head: true }),
  ]);
  return (
    <>
      <div className="top"><h1>أهلاً {me?.name}</h1><span className="pill">المرحلة 1 — الأساس</span></div>
      <div className="row" style={{ alignItems: "stretch" }}>
        {[["المواقع", locs], ["الأصناف", items], ["المستخدمين", users]].map(([l, n]) => (
          <div key={l as string} className="card" style={{ flex: "1 1 160px" }}>
            <div className="muted" style={{ fontSize: 13 }}>{l}</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{n ?? 0}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>اللي جاي</h2>
        <div className="note">المرحلة 1: الدخول، المستخدمين والصلاحيات، المواقع، الأصناف والعائلات، دفتر المخزون. بعدها المصنع (أوامر الإنتاج، تابلت الغرف، التغليف وترقيم العلب)، وبعدها التحميل بالصناديق، والطلبات والتطبيق. الداشبورد التجريبي هو المرجع لكل شاشة.</div>
      </div>
    </>
  );
}
