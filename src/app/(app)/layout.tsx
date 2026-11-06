import { redirect } from "next/navigation";
import { getMe, can } from "@/lib/perms";
import { NAV } from "@/lib/nav";
import SideNav from "./SideNav";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  // كل واحد بيشوف الشاشات اللي معاه صلاحيتها بس
  const groups = NAV.map((g) => ({ ...g, links: g.links.filter((l) => !l.perms || l.perms.some((p) => can(me, p))) })).filter((g) => g.links.length);
  return (
    <div className="shell">
      <SideNav groups={groups} name={me.name} signOut={signOut} />
      <main className="main">{children}</main>
    </div>
  );
}
