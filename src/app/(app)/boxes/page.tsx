import { redirect } from "next/navigation";
import { getMe, can } from "@/lib/perms";
import BoxLookup from "./BoxLookup";

export default async function Boxes({ searchParams }: { searchParams: Promise<{ sn?: string }> }) {
  const { sn } = await searchParams;
  const me = await getMe();
  if (!can(me, "stock.view") && !can(me, "prod.pack") && !can(me, "trips.load")) redirect("/dashboard");
  return (
    <>
      <div className="top"><h1>تتبّع العلبة</h1><span className="pill">امسح ← اعرف هي فين وحصلها إيه</span></div>
      <BoxLookup canFix={can(me, "stock.edit")} initial={sn ? Number(sn) || undefined : undefined} />
    </>
  );
}
