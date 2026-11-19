"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import SettleBox from "@/components/SettleBox";
import CompBox from "@/components/CompBox";

type M = { kind: string; amount: number; method: string | null; note: string | null; at: string };
const K: Record<string, string> = { over: "دفع زيادة", under: "دفع أقل", use: "اتخصم من رصيده", settle_in: "سدّد", settle_out: "رجّعناله", comp: "تعويض", refund: "مرتجع", adjust: "تعديل" };

export default function CustMoney({ id, balance, moves, canSettle, canComp }: { id: number; balance: number; moves: M[]; canSettle: boolean; canComp: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<string | null>(null);
  const done = () => setTimeout(() => router.refresh(), 1200);
  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>رصيده عندنا</h2>
        <b className="num" style={{ fontSize: 20, color: balance < 0 ? "var(--bad)" : balance > 0 ? "var(--good)" : undefined }}>{balance === 0 ? "صفر" : balance < 0 ? `عليه ${-balance} ج` : `ليه ${balance} ج`}</b>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {canSettle && balance !== 0 && <button className={tab === "s" ? "btn pri" : "btn"} onClick={() => setTab(tab === "s" ? null : "s")}>سجّل تسوية</button>}
        {canComp && <button className={tab === "c" ? "btn pri" : "btn"} onClick={() => setTab(tab === "c" ? null : "c")}>🎁 تعويض</button>}
      </div>
      {tab === "s" && <SettleBox customerId={id} balance={balance} onDone={done} />}
      {tab === "c" && <CompBox customerId={id} onDone={done} />}
      {moves.length > 0 && (
        <table>
          <thead><tr><th>التاريخ</th><th>الحركة</th><th>المبلغ</th><th>ملاحظة</th></tr></thead>
          <tbody>{moves.map((m, i) => <tr key={i}><td>{new Date(m.at).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}</td><td>{K[m.kind] ?? m.kind}{m.method ? ` · ${m.method}` : ""}</td><td className="num" style={{ color: m.amount < 0 ? "var(--bad)" : "var(--good)" }}>{m.amount > 0 ? "+" : ""}{m.amount}</td><td className="muted">{m.note}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
