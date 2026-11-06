import Link from "next/link";
const T: [string, string][] = [["/hr", "الحضور"], ["/hr/leaves", "الإجازات والسلف"], ["/hr/messages", "رسايل الموظفين"], ["/users", "الموظفين والصلاحيات"], ["/locations", "أماكن الحضور"]];
export default function Tabs({ cur }: { cur: string }) {
  return <div className="row" style={{ marginBottom: 12 }}>{T.map(([h, l]) => <Link key={h} href={h} className={h === cur ? "btn pri" : "btn"} style={{ display: "inline-grid", placeItems: "center" }}>{l}</Link>)}</div>;
}
