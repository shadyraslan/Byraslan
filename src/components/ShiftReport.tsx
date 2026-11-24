"use client";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Line = { k: "sale" | "order"; no: number; at: string; total: number; pay: string };
export type Rep = { shift: { id: number; loc: string; cashier: string; opened_at: string; closed_at: string | null; status: string }; lines: Line[]; cash: number; electronic: number; other: number; online_cash: number; rider_cash: number; refunds_cash: number; count: number; cash_held: number; custody: number };
const f2 = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const t = (s: string) => new Date(s).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" });

/** تقرير الوردية: كل فاتورة وطلب بقيمته ونوع التحصيل، وتحت الإجماليات والكاش اللي مع الموظف */
export function ShiftReportView({ r }: { r: Rep }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="muted" style={{ fontSize: 13 }}>{r.shift.cashier} · {r.shift.loc} · من {t(r.shift.opened_at)}{r.shift.closed_at ? ` لـ ${t(r.shift.closed_at)}` : " (لسه مفتوحة)"} · {r.count} أوردر</div>
      <div style={{ maxHeight: 340, overflow: "auto" }}>
        <table>
          <thead><tr><th>الرقم</th><th>الوقت</th><th>النوع</th><th>التحصيل</th><th>القيمة</th></tr></thead>
          <tbody>{r.lines.map((l, i) => (
            <tr key={i}><td className="num">#{l.no}</td><td className="num">{t(l.at)}</td><td>{l.k === "sale" ? "كاشير" : "أونلاين"}</td><td>{l.pay || "—"}</td><td className="num">{f2(l.total)}</td></tr>))}
            {!r.lines.length && <tr><td colSpan={5} className="muted">مفيش أوردرات في الوردية دي</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 12 }}>اتحصّل كاش</div><b className="num" style={{ fontSize: 18 }}>{f2(r.cash + r.rider_cash)}</b>{r.rider_cash > 0 && <div className="muted" style={{ fontSize: 11 }}>منهم {f2(r.rider_cash)} من الطيارين</div>}</div>
        <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 12 }}>اتحصّل إلكتروني</div><b className="num" style={{ fontSize: 18 }}>{f2(r.electronic)}</b></div>
        {r.other > 0 && <div className="card" style={{ margin: 0 }}><div className="muted" style={{ fontSize: 12 }}>آجل ونقاط وحسابات</div><b className="num" style={{ fontSize: 18 }}>{f2(r.other)}</b></div>}
        <div className="card" style={{ margin: 0, borderColor: "var(--y)", borderWidth: 2 }}><div className="muted" style={{ fontSize: 12 }}>الكاش اللي معاك</div><b className="num" style={{ fontSize: 20 }}>{f2(r.cash_held)}</b>{r.refunds_cash > 0 && <div className="muted" style={{ fontSize: 11 }}>بعد {f2(r.refunds_cash)} مرتجع</div>}</div>
      </div>
      <div className="muted" style={{ fontSize: 12.5 }}>الكاش اللي معاك بيتضاف لعهدتك لما تقفل الوردية (عهدتك دلوقتي {f2(r.custody)} ج)، وبتسلّمه من «العهدة» في تطبيق الموظفين.</div>
    </div>
  );
}

export function useShiftReport(sb: SupabaseClient, shiftId: number | null | undefined, clientId: string | null | undefined, tick = 0) {
  const [r, setR] = useState<Rep | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      let id = shiftId ?? null;
      if (!id && clientId) { const { data } = await sb.from("shifts").select("id").eq("client_id", clientId).maybeSingle(); id = data?.id ?? null; }
      if (!id) return setErr("الوردية لسه ماوصلتش السيستم — اتأكد من النت");
      const { data, error } = await sb.rpc("shift_report", { p_shift: id });
      if (!alive) return;
      if (error) setErr(error.message.replace(/^.*?ERROR:\s*/, "")); else { setErr(null); setR(data as Rep); }
    })();
    return () => { alive = false; };
  }, [shiftId, clientId, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return { r, err };
}
