import Link from "next/link";
import { MODULES, BRANCH_APPS } from "@/lib/apps";

export default async function Soon({ searchParams }: { searchParams: Promise<{ m?: string; b?: string }> }) {
  const { m = "", b } = await searchParams;
  const app = [...MODULES, ...BRANCH_APPS].find((a) => a.id === m);
  return (
    <div className="card" style={{ textAlign: "center", padding: 40 }}>
      <h1 style={{ fontSize: 20 }}>{app?.label ?? "الشاشة دي"} — بتتبني دلوقتي</h1>
      <p className="muted">الشكل والطريقة متفق عليهم في البروتوتايب، وهتنزل هنا في المرحلة الجاية.</p>
      <Link className="btn" href={b ? `/branches/${b}` : "/dashboard"} style={{ display: "inline-grid", placeItems: "center" }}>رجوع</Link>
    </div>
  );
}
