import Link from "next/link";

const T: [string, string][] = [["/purchasing", "أوامر التوريد"], ["/purchasing/specs", "كارت الصنف"], ["/purchasing/suppliers", "الموردين"], ["/overrides", "التجاوزات"]];
export default function Tabs({ cur }: { cur: string }) {
  return <div className="row" style={{ marginBottom: 12 }}>{T.map(([h, l]) => <Link key={h} href={h} className={h === cur ? "btn pri" : "btn"} style={{ display: "inline-grid", placeItems: "center" }}>{l}</Link>)}</div>;
}
