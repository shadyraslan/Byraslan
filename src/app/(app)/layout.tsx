import { redirect } from "next/navigation";
import { getMe, can } from "@/lib/perms";
import { NAV } from "@/lib/nav";
import SideNav from "./SideNav";
import { signOut } from "./actions";
import { cookies } from "next/headers";
import { backToMe } from "./users/staff";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  // كل واحد بيشوف الشاشات اللي معاه صلاحيتها بس
  const groups = NAV.map((g) => ({ ...g, links: g.links.filter((l) => !l.perms || l.perms.some((p) => can(me, p))) })).filter((g) => g.links.length);
  const as = (await cookies()).get("as_name")?.value;
  return (
    <div className="shell">
      {as && (
        <form action={backToMe} style={{ position: "fixed", insetInline: 0, bottom: 0, zIndex: 999, background: "#F2B705", color: "#000", padding: "8px 14px", display: "flex", gap: 10, alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
          👁 انت داخل كأنك {decodeURIComponent(as)} — بتشوف صلاحياته بس
          <button className="btn" style={{ height: 32, background: "#000", color: "#F2B705" }}>ارجع لحسابي</button>
        </form>
      )}
      <SideNav groups={groups} name={me.name} signOut={signOut} />
      <main className="main">{children}</main>
    </div>
  );
}
