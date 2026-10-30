import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { MODULES, LOC_ICON, LOC_TYPE } from "@/lib/apps";
import Tile from "@/components/Tile";

export default async function Home() {
  const me = await getMe();
  const sb = await supabaseServer();
  const { data: locs } = await sb.from("locations").select("id,name,type,city,active").eq("active", true).order("sort");
  const branches = (locs ?? []).filter((l) => ["dark", "shop"].includes(l.type));
  const sites = (locs ?? []).filter((l) => ["factory", "warehouse", "donation"].includes(l.type));
  const mods = MODULES.filter((m) => !m.perm || can(me, m.perm));
  return (
    <>
      <div className="top"><h1>أهلاً {me?.name}</h1></div>

      <h2 className="sec">الفروع</h2>
      <div className="tiles">
        {branches.map((b) => <Tile key={b.id} href={`/branches/${b.id}`} icon={LOC_ICON[b.type]} color="#f5c800" label={b.name} sub={`${LOC_TYPE[b.type]}${b.city ? " · " + b.city : ""}`} />)}
        {sites.map((b) => <Tile key={b.id} href={`/branches/${b.id}`} icon={LOC_ICON[b.type]} color="#0d0d0d" label={b.name} sub={LOC_TYPE[b.type]} />)}
        {!branches.length && !sites.length && <div className="note">مفيش فروع لسه — ضيفها من المواقع والفروع</div>}
      </div>

      <h2 className="sec">الأقسام</h2>
      <div className="tiles">
        {mods.map((m) => <Tile key={m.id} href={m.href ?? `/soon?m=${m.id}`} icon={m.icon} color={m.color} label={m.label} soon={!m.href} />)}
      </div>
    </>
  );
}
