import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { BRANCH_APPS, LOC_ICON, LOC_TYPE } from "@/lib/apps";
import Tile from "@/components/Tile";
import Icon from "@/components/Icon";

export default async function Branch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  const sb = await supabaseServer();
  const { data: loc } = await sb.from("locations").select("id,name,type,city").eq("id", id).maybeSingle();
  if (!loc) notFound();
  const { data: subs } = await sb.from("locations").select("id,name,type").eq("parent", id).eq("active", true).order("sort");
  const isShop = ["dark", "shop"].includes(loc.type);
  const apps = BRANCH_APPS.filter((a) => (!a.perm || can(me, a.perm)) && (isShop || !["pos", "orders", "partner", "receive"].includes(a.id)));
  return (
    <>
      <div className="crumbs"><Link href="/dashboard">الرئيسية</Link> ‹ <span>{loc.name}</span></div>
      <div className="top">
        <h1 style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="hico"><Icon name={LOC_ICON[loc.type]} /></span>{loc.name}</h1>
        <span className="pill">{LOC_TYPE[loc.type]}{loc.city ? " · " + loc.city : ""}</span>
      </div>
      <div className="tiles">
        {apps.map((a) => <Tile key={a.id} href={a.href ?? `/soon?m=${a.id}&b=${loc.id}`} icon={a.icon} color={a.color} label={a.label} soon={!a.href} />)}
      </div>
      {!!subs?.length && (
        <>
          <h2 className="sec">تابع لـ {loc.name}</h2>
          <div className="tiles">{subs.map((s) => <Tile key={s.id} href={`/branches/${s.id}`} icon={LOC_ICON[s.type]} color="#0d0d0d" label={s.name} sub={LOC_TYPE[s.type]} />)}</div>
        </>
      )}
    </>
  );
}
