"use client";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Line = { k: "sale" | "order"; id: number; no: number; at: string; total: number; pay: string; customer: string | null; items: { name: string; qty: number; unit: string; total: number; box?: number | null }[] | null };
export type Rep = { shift: { id: number; loc: string; cashier: string; opened_at: string; closed_at: string | null; status: string }; lines: Line[]; cash: number; electronic: number; other: number; online_cash: number; rider_cash: number; refunds_cash: number; count: number; cash_held: number; custody: number };
const f2 = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const t = (s: string) => new Date(s).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" });

/** تقرير الوردية: كل فاتورة وطلب بقيمته ونوع التحصيل، وتحت الإجماليات والكاش اللي مع الموظف */
export function ShiftReportView({ r }: { r: Rep }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="muted" style={{ fontSize: 13 }}>{r.shift.cashier} · {r.shift.loc} · من {t(r.shift.opened_at)}{r.shift.closed_at ? ` لـ ${t(r.shift.closed_at)}` : " (لسه مفتوحة)"} · {r.count} أوردر</div>
      <div style={{ maxHeight: 340, overflow: "auto" }}>
        <table>
          <thead><tr><th>الرقم</th><th>الوقت</th><th>العميل</th><th>النوع</th><th>التحصيل</th><th>القيمة</th></tr></thead>
          <tbody>{r.lines.map((l) => {
            const k = `${l.k}${l.id}`, on = open === k;
            return [
              <tr key={k} onClick={() => setOpen(on ? null : k)} style={{ cursor: "pointer", background: on ? "var(--sunk)" : undefined }} title="دوس عشان تشوف التفاصيل">
                <td className="num">{on ? "▾" : "▸"} #{l.no}</td><td className="num">{t(l.at)}</td><td>{l.customer || <span className="muted">عميل كاشير</span>}</td><td>{l.k === "sale" ? "كاشير" : "أونلاين"}</td><td>{l.pay || "—"}</td><td className="num">{f2(l.total)}</td>
              </tr>,
              on && (
                <tr key={k + "d"}><td colSpan={6} style={{ background: "var(--sunk)" }}>
                  {(l.items ?? []).map((x, j) => <div key={j} className="row" style={{ justifyContent: "space-between", fontSize: 13 }}><span>{x.name}{x.box ? <span className="muted"> · طبق #{x.box}</span> : null}</span><span className="num">{x.qty} {x.unit} · {f2(x.total)} ج</span></div>)}
                  {!(l.items ?? []).length && <span className="muted">مفيش أصناف</span>}
                </td></tr>
              ),
            ];
          })}
            {!r.lines.length && <tr><td colSpan={6} className="muted">مفيش أوردرات في الوردية دي</td></tr>}
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
