import Copy from "./Copy";

export const revalidate = 600;
export const metadata = { title: "نزّل تطبيقات باي رسلان" };

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
      <h1>نزّل تطبيقات باي رسلان</h1>
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
      <div className="help">
        <b>لو الموبايل رفض يثبّت:</b> افتح الملف من الإشعارات أو من "التنزيلات"، ولو ظهرت رسالة "مصدر غير معروف" دوس الإعدادات ← اسمح من المصدر ده ← ارجع ودوس تثبيت.
      </div>
    </div>
  );
}
