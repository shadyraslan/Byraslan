import Link from "next/link";
const T: [string, string][] = [["/accounts", "الملخص اليومي"], ["/accounts/expenses", "المصروفات"], ["/accounts/suppliers", "حسابات الموردين"], ["/sales", "المبيعات والورديات"]];
export default function Tabs({ cur }: { cur: string }) {
  return <div className="row noprint" style={{ marginBottom: 12 }}>{T.map(([h, l]) => <Link key={h} href={h} className={h === cur ? "btn pri" : "btn"} style={{ display: "inline-grid", placeItems: "center" }}>{l}</Link>)}</div>;
}
