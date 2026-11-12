import Copy from "./Copy";

export const revalidate = 600;
export const metadata = { title: "تطبيقات وروابط باي رسلان" };

type Rel = { tag_name: string; published_at: string; assets: { name: string; browser_download_url: string }[] };
const REPO = "shadyraslan/Byraslan";

/** آخر نسخة لكل تطبيق من GitHub Releases (الريبو عام) */
async function latest(): Promise<Record<string, { url: string; at: string } | undefined>> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=40`, { headers: { Accept: "application/vnd.github+json" }, next: { revalidate: 600 } });
    const rels = (await r.json()) as Rel[];
    const find = (names: string[]) => {
      for (const rel of rels) { const a = rel.assets.find((x) => names.includes(x.name)); if (a) return { url: a.browser_download_url, at: rel.published_at }; }
    };
    return { customer: find(["byraslan.apk", "byraslan-test.apk"]), staff: find(["byraslan-staff.apk"]) };
  } catch { return {}; }
}

const APPS = [
  { key: "customer", name: "باي رسلان", tag: "للعملاء", desc: "اطلب من روستوز ورسلان ماركت وتابع طلبك لحد باب البيت." },
  { key: "staff", name: "باي رسلان — الموظفين", tag: "للموظفين والسواقين", desc: "الحضور، الورديات، المرتب، العهدة، الإجازات، والرسايل." },
] as const;

const BASE = "https://byraslan.vercel.app";
/** روابط الشغل على الويب — كل واحد بيفتح بحساب الموظف وصلاحياته */
const LINKS = [
  { path: "/dashboard", name: "الداشبورد", desc: "الإدارة كلها: الأقسام، التقارير، الصلاحيات، الإعدادات", ic: "📊" },
  { path: "/cashier", name: "الكاشير", desc: "البيع في الفرع، المرتجع، النقاط، الآجل، طلبات الأونلاين", ic: "🧾" },
  { path: "/orders", name: "طلبات الأونلاين", desc: "تجهيز وتسليم طلبات التطبيق والموقع", ic: "🛵" },
  { path: "/cs", name: "خدمة العملاء", desc: "التذاكر، طلبات التليفون والواتساب، بيانات العملاء", ic: "🎧" },
  { path: "/partner/dispatch", name: "ديسباتشر الماركت", desc: "تجهيز أصناف الماركت الشريك، البدايل، وتسليم الكابتن بالكود", ic: "🛒" },
  { path: "/order", name: "صفحة الطلب للعملاء", desc: "العميل يطلب من المتصفح من غير تطبيق", ic: "🌐" },
  { path: "/apps", name: "الصفحة دي", desc: "ابعتها لأي حد عايز ينزّل التطبيقات", ic: "🔗" },
] as const;

export default async function Apps() {
  const L = await latest();
  return (
    <div className="apps">
      <style>{`
        .apps{min-height:100vh;background:#F6F5F0;color:#141410;font-family:Cairo,system-ui,sans-serif;direction:rtl;padding:16px;padding-bottom:40px}
        .apps .bar{background:#0D0D0D;color:#fff;border-radius:18px;padding:14px 20px;font-weight:900;font-size:22px;max-width:640px;margin:0 auto}
        .apps .bar b{color:#F5C800}
        .apps h1{font-size:30px;font-weight:900;margin:28px auto 4px;max-width:640px}
        .apps .sub{color:#7A6200;margin:0 auto 22px;max-width:640px}
        .apps .card{background:#fff;border:2px solid #141410;border-radius:26px;padding:20px;max-width:640px;margin:0 auto 18px;display:grid;gap:12px}
        .apps .hd{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
        .apps .hd h2{margin:0;font-size:22px;font-weight:900}
        .apps .pill{background:#FFF3C4;color:#6B5600;border-radius:20px;padding:4px 14px;font-weight:700;font-size:14px}
        .apps .dl{display:block;text-align:center;background:#F5C800;color:#141410;border:2px solid #141410;border-radius:999px;padding:14px;font-size:20px;font-weight:900;text-decoration:none}
        .apps .dl.off{background:#eee;color:#888;border-color:#ccc;pointer-events:none}
        .apps .cp{width:100%;background:#fff;border:2px solid #141410;border-radius:999px;padding:10px;font:700 16px Cairo,system-ui,sans-serif;cursor:pointer}
        .apps .meta{color:#8C8C86;font-size:12.5px}
        .apps .help{max-width:640px;margin:0 auto;color:#555;font-size:14px;line-height:1.9}
      `}</style>
      <div className="bar"><b>باي</b> رسلان</div>
      <h1>تطبيقات وروابط باي رسلان</h1>
      <p className="sub">للموبايلات الأندرويد. على الآيفون قريب.</p>
      {APPS.map((a) => {
        const x = L[a.key];
        return (
          <div className="card" key={a.key}>
            <div className="hd"><h2>{a.name}</h2><span className="pill">{a.tag}</span></div>
            <div>{a.desc}</div>
            <a className={x ? "dl" : "dl off"} href={x?.url ?? "#"}>⬇️ نزّل {a.name}</a>
            {x && <Copy url={x.url} />}
            {x && <div className="meta">آخر تحديث: {new Date(x.at).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })}</div>}
          </div>
        );
      })}
      <h1 style={{ fontSize: 24 }}>روابط الشغل على الكمبيوتر</h1>
      <p className="sub">بتفتح بإيميل الموظف، وكل واحد بيشوف اللي صلاحياته تسمح بيه بس.</p>
      {LINKS.map((l) => (
        <div className="card" key={l.path} style={{ gap: 8 }}>
          <div className="hd"><h2>{l.ic} {l.name}</h2><span className="meta" dir="ltr">{BASE.replace("https://", "")}{l.path}</span></div>
          <div>{l.desc}</div>
          <a className="dl" href={l.path} style={{ fontSize: 17, padding: 10 }}>افتح {l.name}</a>
          <Copy url={BASE + l.path} label="انسخ اللينك" />
        </div>
      ))}
      <div className="help">
        <b>لو الموبايل رفض يثبّت:</b> افتح الملف من الإشعارات أو من "التنزيلات"، ولو ظهرت رسالة "مصدر غير معروف" دوس الإعدادات ← اسمح من المصدر ده ← ارجع ودوس تثبيت.
      </div>
    </div>
  );
}
