import { redirect } from "next/navigation";
import { getMe } from "@/lib/perms";
import { signOut } from "./actions";
import AppTopbar from "@/components/AppTopbar";
import AppSidebar from "@/components/AppSidebar";
import { NAV_GROUPS } from "@/lib/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  const navLinks = [
    ...new Map(
      NAV_GROUPS.flatMap(([, links]) => links.map(([label, href]) => [href, { href, label }] as const)),
    ).values(),
  ];
  return (
    <div className="shell">
      <AppSidebar />
      <AppTopbar name={me.name} isOwner={me.isOwner} links={navLinks} signOutAction={signOut} />
      <main className="main">{children}</main>
    </div>
  );
}
