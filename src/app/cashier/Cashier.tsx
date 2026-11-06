"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ScanInput from "@/components/ScanInput";
import { supabaseBrowser } from "@/lib/supabase/client";
import * as kv from "@/lib/idb";
import OrdersPanel, { useOrders } from "./Orders";

/* ===== الكاشير من غير نت =====
   - نسخة من أصناف وأسعار وعلب الفرع محفوظة على الجهاز وبتتحدّث كل 5 دقايق لما النت موجود.
   - كل فاتورة بتتحفظ على الجهاز الأول وبتتطبع، وبعدين بتترفع (pos_sync) لما النت يكون موجود.
   - الوردية نفسها بتتفتح وتتقفل من غير نت، وبتتسجّل في السيستم أول ما النت يرجع. */

type Item = { id: number; name: string; unit: string; sold_by: string; arm: string; kind: string; plu: string | null; price: number };
type Snap = { loc: string; name: string; at: string; refresh_min?: number; can_discount: boolean; can_orders?: boolean; scale: { prefix: string; plu_digits: number; weight_digits: number; decimals: number } | null; items: Item[]; barcodes: { code: string; item_id: number }[]; boxes: { sn: number; item_id: number; weight: number }[] };
type Line = { item_id: number; name: string; unit: string; box_sn: number | null; qty: number; unit_price: number };
type Sale = { client_id: string; shift: string; at: string; local_no: string; lines: Line[]; discount: number; cash: number; card: number; offline: boolean };
type Done = Sale & { no?: number; conflicts?: string[]; total: number; change: number };
type Shift = { client_id: string; loc: string; loc_name: string; opening_cash: number; opened_at: string; server_id?: number; closing?: { counted: number; closed_at: string } };
type Me = { id: string; name: string; home: string | null };

const f2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round(n * 100) / 100;
const hhmm = (s?: string) => (s ? new Date(s).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" }) : "—");
const uuid = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));
const totalOf = (s: Sale) => Math.max(r2(s.lines.reduce((a, l) => a + r2(l.qty * l.unit_price), 0) - s.discount), 0);

export default function Cashier() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [online, setOnline] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [locs, setLocs] = useState<{ id: string; name: string }[]>([]);
  const [shift, setShift] = useState<Shift | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [outbox, setOutbox] = useState<Sale[]>([]);
  const [done, setDone] = useState<Done[]>([]);
  const [booted, setBooted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [disc, setDisc] = useState("");
  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  const [rec, setRec] = useState<Done | null>(null);
  const [view, setView] = useState<"sell" | "orders" | "list" | "close">("sell");
  const [counted, setCounted] = useState("");
  const [openLoc, setOpenLoc] = useState("");
  const [openCash, setOpenCash] = useState("0");
  const [install, setInstall] = useState<(Event & { prompt: () => void }) | null>(null);
  const busy = useRef(false);

  // ---------- تشغيل ----------
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const bip = (e: Event) => { e.preventDefault(); setInstall(e as Event & { prompt: () => void }); };
    window.addEventListener("beforeinstallprompt", bip);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/cashier-sw.js", { scope: "/cashier" }).catch(() => {});
    (async () => {
      const [m, l, sh, ob, dn] = await Promise.all([kv.get<Me>("me"), kv.get<{ id: string; name: string }[]>("locs"), kv.get<Shift>("shift"), kv.get<Sale[]>("outbox"), kv.get<Done[]>("done")]);
      if (m) setMe(m); if (l) setLocs(l); if (sh) setShift(sh); setOutbox(ob ?? []); setDone(dn ?? []);
      if (sh) { const s = await kv.get<Snap>("snap:" + sh.loc); if (s) setSnap(s); }
      if (navigator.onLine) {
        try {
          const { data: u } = await sb.auth.getUser();
          if (u.user) {
            const [{ data: p }, { data: L }] = await Promise.all([
              sb.from("profiles").select("id,name,home_loc").eq("id", u.user.id).single(),
              sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort"),
            ]);
            if (p) { const mm = { id: p.id as string, name: p.name as string, home: (p.home_loc as string) ?? null }; setMe(mm); kv.set("me", mm); }
            if (L) { setLocs(L as { id: string; name: string }[]); kv.set("locs", L); }
          }
        } catch {}
      }
      setBooted(true);
    })();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); window.removeEventListener("beforeinstallprompt", bip); };
  }, [sb]);

  useEffect(() => { if (!openLoc && (me?.home || locs[0])) setOpenLoc(me?.home ?? locs[0].id); }, [me, locs, openLoc]);

  // ---------- نسخة الفرع ----------
  const refreshMin = useRef(1);
  const refreshSnap = useCallback(async (loc: string) => {
    if (!navigator.onLine) return;
    sb.rpc("pos_ping", { p_loc: loc }).then(() => {}, () => {});
    const { data, error } = await sb.rpc("pos_snapshot", { p_loc: loc });
    if (error || !data) return;
    const s = data as Snap;
    s.items = s.items.map((i) => ({ ...i, price: Number(i.price) }));
    s.boxes = s.boxes.map((b) => ({ ...b, weight: Number(b.weight) }));
    refreshMin.current = Math.max(Number(s.refresh_min) || 1, 0.25);
    setSnap(s); await kv.set("snap:" + loc, s);
  }, [sb]);
  // التحديث كل كام دقيقة = إعداد من السيستم (pos.refresh_minutes)، ولحظة ما النت يرجع
  const loc = shift?.loc;
  useEffect(() => {
    if (!loc) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => { await refreshSnap(loc); t = setTimeout(loop, refreshMin.current * 60 * 1000); };
    loop();
    const on = () => refreshSnap(loc);
    window.addEventListener("online", on);
    return () => { clearTimeout(t); window.removeEventListener("online", on); };
  }, [loc, refreshSnap]);

  // ---------- طلبات الأونلاين ----------
  const ord = useOrders(sb, shift?.loc, !!snap?.can_orders, online);

  // ---------- الرفع ----------
  const sync = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    const sh = await kv.get<Shift>("shift");
    const ob = (await kv.get<Sale[]>("outbox")) ?? [];
    if (!sh) return;
    busy.current = true; setSyncing(true);
    try {
      const batch = ob.slice(0, 50);
      const shPayload = [{ client_id: sh.client_id, opening_cash: sh.opening_cash, opened_at: sh.opened_at, ...(sh.closing && batch.length === ob.length ? { counted: sh.closing.counted, closed_at: sh.closing.closed_at } : {}) }];
      const { data, error } = await sb.rpc("pos_sync", { p_loc: sh.loc, p_shifts: shPayload, p_sales: batch.map(({ lines, ...s }) => ({ ...s, lines: lines.map(({ item_id, box_sn, qty, unit_price }) => ({ item_id, box_sn, qty, unit_price })) })) });
      if (error) throw new Error(error.message);
      const r = data as { shifts: { client_id: string; id: number }[]; sales: { client_id: string; no: number; conflicts?: string[] }[] };
      const ok = new Map(r.sales.map((x) => [x.client_id, x]));
      const rest = ob.filter((s) => !ok.has(s.client_id));
      await kv.set("outbox", rest); setOutbox(rest);
      const dn = ((await kv.get<Done[]>("done")) ?? []).map((d) => (ok.has(d.client_id) ? { ...d, no: ok.get(d.client_id)!.no, conflicts: ok.get(d.client_id)!.conflicts ?? [] } : d));
      await kv.set("done", dn); setDone(dn);
      const ns: Shift = { ...sh, server_id: r.shifts[0]?.id };
      if (sh.closing && !rest.length) { await kv.del("shift"); await kv.set("done", []); setShift(null); setDone([]); setView("sell"); }
      else { await kv.set("shift", ns); setShift(ns); }
      setSyncErr(null);
      if (rest.length) setTimeout(() => { busy.current = false; sync(); }, 300);
    } catch (e) {
      setSyncErr(String((e as Error).message ?? e).replace(/^.*?ERROR:\s*/, ""));
    } finally { busy.current = false; setSyncing(false); }
  }, [sb]);
  useEffect(() => { if (online) sync(); const t = setInterval(sync, 20000); return () => clearInterval(t); }, [online, sync]);

  // ---------- فتح الوردية ----------
  const openShift = async () => {
    const loc = openLoc || me?.home || locs[0]?.id;
    if (!loc) return;
    const sh: Shift = { client_id: uuid(), loc, loc_name: locs.find((l) => l.id === loc)?.name ?? loc, opening_cash: Number(openCash) || 0, opened_at: new Date().toISOString() };
    await kv.set("shift", sh); await kv.set("done", []); setShift(sh); setDone([]);
    const s = await kv.get<Snap>("snap:" + loc); if (s) setSnap(s);
    await refreshSnap(loc); sync();
  };

  // ---------- البحث في نسخة الفرع ----------
  const soldLocal = useMemo(() => new Set([...outbox, ...done].flatMap((s) => s.lines.map((l) => l.box_sn).filter((x): x is number => !!x))), [outbox, done]);
  const bad = (t: string) => { setMsg({ ok: false, t }); try { navigator.vibrate?.(200); } catch {} };
  const lookup = (raw: string): Line | string => {
    if (!snap) return "لسه مفيش نسخة من أصناف الفرع على الجهاز — وصّل النت مرة";
    const code = raw.trim();
    const v = code.toUpperCase();
    const item = (id: number) => snap.items.find((i) => i.id === id);
    const sc = snap.scale;
    if (sc && /^\d{13}$/.test(v) && v.startsWith(sc.prefix)) {
      const plu = v.substr(sc.prefix.length, sc.plu_digits);
      const w = Number(v.substr(sc.prefix.length + sc.plu_digits, sc.weight_digits)) / 10 ** sc.decimals;
      const it = snap.items.find((i) => (i.plu ?? "").padStart(sc.plu_digits, "0") === plu);
      if (!it) return `كود الميزان ${plu} مش متسجّل أو مالوش سعر في الفرع`;
      return { item_id: it.id, name: it.name, unit: it.unit, box_sn: null, qty: w, unit_price: it.price };
    }
    const bc = snap.barcodes.find((b) => b.code === code);
    if (!bc && /^R?\d{3,9}(\|.*)?$/.test(v)) {
      const sn = Number((v.split("|")[0].match(/\d+/) ?? ["0"])[0]);
      if (soldLocal.has(sn) || lines.some((l) => l.box_sn === sn)) return `العلبة #${sn} اتباعت قبل كده`;
      const b = snap.boxes.find((x) => x.sn === sn);
      if (!b) return `العلبة #${sn} مش في مخزون الفرع (حسب آخر تحديث ${hhmm(snap.at)})`;
      const it = item(b.item_id);
      if (!it) return `مفيش سعر لصنف العلبة #${sn} في الفرع`;
      return { item_id: it.id, name: it.name, unit: it.unit, box_sn: sn, qty: it.sold_by === "piece" || it.unit === "قطعة" ? 1 : b.weight, unit_price: it.price };
    }
    if (!bc) return "الكود ده مش متسجّل";
    const it = item(bc.item_id);
    if (!it) return "مفيش سعر للصنف ده في الفرع";
    if (it.arm === "rostos" && it.kind === "product") return `${it.name} بيتباع بالعلبة — امسح QR العلبة`;
    return { item_id: it.id, name: it.name, unit: it.unit, box_sn: null, qty: 1, unit_price: it.price };
  };
  const onScan = async (code: string) => {
    if (shift?.closing) return bad("الوردية بتتقفل — مفيش بيع");
    let l = lookup(code);
    // مش لاقيه على الجهاز والنت موجود؟ (علبة لسه واصلة أو صنف لسه متضاف) — نسأل السيستم على طول ونحدّث النسخة
    if (typeof l === "string" && navigator.onLine && shift && !l.includes("اتباعت قبل كده") && !l.includes("بيتباع بالعلبة")) {
      const { data } = await sb.rpc("pos_lookup", { p_loc: shift.loc, p_code: code });
      const r = (Array.isArray(data) ? data[0] : data) as { item_id: number; item_name: string; unit: string; box_sn: number | null; qty: number; unit_price: number } | undefined;
      if (r && !(r.box_sn && (soldLocal.has(r.box_sn) || lines.some((x) => x.box_sn === r.box_sn)))) {
        l = { item_id: r.item_id, name: r.item_name, unit: r.unit, box_sn: r.box_sn, qty: Number(r.qty), unit_price: Number(r.unit_price) };
        refreshSnap(shift.loc);
      }
    }
    if (typeof l === "string") return bad(l);
    const line = l;
    setLines((L) => {
      if (!line.box_sn && Number.isInteger(line.qty)) {
        const i = L.findIndex((x) => !x.box_sn && x.item_id === line.item_id && Number.isInteger(x.qty));
        if (i >= 0) return L.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x));
      }
      return [...L, line];
    });
    setMsg({ ok: true, t: `✓ ${line.name}${line.box_sn ? ` #${line.box_sn}` : ""} — ${line.qty} ${line.unit} × ${f2(line.unit_price)}` });
  };

  // ---------- الدفع ----------
  const sub = lines.reduce((a, l) => a + r2(l.qty * l.unit_price), 0);
  const d = Math.min(Number(disc) || 0, sub);
  const total = Math.max(r2(sub - d), 0);
  const paid = (Number(cash) || 0) + (Number(card) || 0);
  const pay = async () => {
    if (!shift || !lines.length) return bad("الفاتورة فاضية");
    const k = Number(card) || 0;
    const c = cash ? Number(cash) || 0 : Math.max(total - k, 0);
    if (c + k < total) return bad(`المدفوع أقل من الإجمالي (${f2(total)} ج)`);
    if (k > total) return bad("الفيزا أكتر من الإجمالي");
    const seq = ((await kv.get<number>("seq")) ?? 0) + 1; await kv.set("seq", seq);
    const dev = ((await kv.get<string>("dev")) ?? (await (async () => { const x = Math.random().toString(36).slice(2, 5).toUpperCase(); await kv.set("dev", x); return x; })()));
    const s: Sale = { client_id: uuid(), shift: shift.client_id, at: new Date().toISOString(), local_no: `${dev}-${seq}`, lines, discount: d, cash: c, card: k, offline: !navigator.onLine };
    const ob = [...((await kv.get<Sale[]>("outbox")) ?? []), s]; await kv.set("outbox", ob); setOutbox(ob);
    const dn: Done = { ...s, total: totalOf(s), change: r2(c + k - totalOf(s)) };
    const all = [dn, ...((await kv.get<Done[]>("done")) ?? [])].slice(0, 300); await kv.set("done", all); setDone(all);
    setRec(dn); setLines([]); setDisc(""); setCash(""); setCard(""); setMsg(null);
    setTimeout(() => { window.print(); sync(); }, 80);
  };

  // ---------- قفل الوردية ----------
  const expected = shift ? r2(shift.opening_cash + done.reduce((a, s) => a + s.cash - s.change, 0)) : 0;
  const closeShift = async () => {
    if (!shift) return;
    const sh = { ...shift, closing: { counted: Number(counted) || 0, closed_at: new Date().toISOString() } };
    await kv.set("shift", sh); setShift(sh); setCounted("");
    sync();
  };

  // ---------- الشاشات ----------
  const bar = (
    <div className="noprint" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#0d0d0d", color: "#fff", padding: "10px 16px" }}>
      <img src="/logo.png" alt="" style={{ height: 26 }} />
      <b style={{ color: "#f5c800" }}>الكاشير</b>
      {shift && <span>{shift.loc_name} · {me?.name} · وردية من {hhmm(shift.opened_at)}</span>}
      <span style={{ marginInlineStart: "auto", padding: "3px 12px", borderRadius: 99, fontWeight: 700, fontSize: 13, background: online ? "#16a34a" : "#dc2626" }}>{online ? "متصل" : "من غير نت — شغال عادي"}</span>
      <span style={{ fontSize: 13, color: outbox.length ? "#f5c800" : "#aaa" }}>{syncing ? "بيرفع…" : outbox.length ? `${outbox.length} فاتورة مستنية ترتفع` : "كله مترفع ✓"}</span>
      {snap && <span style={{ fontSize: 12, color: "#888" }}>الأسعار والعلب: {hhmm(snap.at)}</span>}
      {install && <button className="btn" style={{ height: 32 }} onClick={() => { install.prompt(); setInstall(null); }}>ثبّت على الجهاز</button>}
    </div>
  );

  if (!booted) return <div style={{ padding: 30 }}>بيحمّل…</div>;
  if (!me) return (<>{bar}<div className="card" style={{ margin: 20 }}><b>محتاج تدخل بحسابك مرة وانت متصل بالنت.</b> <a className="btn pri" href="/login" style={{ display: "inline-grid", placeItems: "center", marginTop: 10 }}>الدخول</a></div></>);

  if (!shift) return (
    <>{bar}
      <div style={{ padding: 20, display: "grid", gap: 14, maxWidth: 560 }}>
        <h1 style={{ margin: 0 }}>افتح الوردية</h1>
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <label className="fld">الفرع<select value={openLoc} onChange={(e) => setOpenLoc(e.target.value)}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="fld">الكاش في الدرج أول الوردية<input value={openCash} onChange={(e) => setOpenCash(e.target.value)} inputMode="decimal" dir="ltr" /></label>
          <button className="btn pri" style={{ height: 52, fontSize: 17 }} onClick={openShift} disabled={!locs.length}>افتح الوردية</button>
          {!online && <div className="muted">من غير نت: الوردية هتتسجّل في السيستم أول ما النت يرجع.</div>}
        </div>
      </div>
    </>
  );

  if (shift.closing) return (
    <>{bar}
      <div className="card" style={{ margin: 20, display: "grid", gap: 10, maxWidth: 560 }}>
        <h2 style={{ margin: 0 }}>الوردية بتتقفل</h2>
        <div>الكاش المتوقع في الدرج: <b className="num">{f2(expected)}</b> · اللي اتعدّ: <b className="num">{f2(shift.closing.counted)}</b></div>
        <div className={shift.closing.counted - expected === 0 ? "okmsg" : "badmsg"}>{shift.closing.counted - expected === 0 ? "الدرج مظبوط" : `${shift.closing.counted - expected > 0 ? "زيادة" : "عجز"} ${f2(Math.abs(shift.closing.counted - expected))} ج`}</div>
        <div className="muted">{online ? (outbox.length ? `بيرفع ${outbox.length} فاتورة وبعدين يقفل…` : "بيقفل…") : "هتتقفل في السيستم أول ما النت يرجع — سيب الجهاز مفتوح أو افتحه تاني لما النت يرجع."}</div>
        {syncErr && <div className="badmsg">{syncErr}</div>}
      </div>
    </>
  );

  return (
    <>
      {bar}
      <div className="noprint" style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" }}>
        {([["sell", "البيع"], ...(snap?.can_orders ? [["orders", `طلبات الأونلاين (${ord.orders.length})`]] : []), ["list", `فواتير الوردية (${done.length})`], ["close", "اقفل الوردية"]] as [typeof view, string][]).map(([k, l]) => <button key={k} className={view === k ? "btn pri" : "btn"} style={k === "orders" && ord.fresh.length ? { background: "var(--bad)", color: "#fff", borderColor: "var(--bad)" } : undefined} onClick={() => setView(k)}>{l}</button>)}
        <button className="btn" onClick={() => shift && refreshSnap(shift.loc)} disabled={!online}>حدّث الأسعار والعلب</button>
        {syncErr && <span className="badmsg" style={{ margin: 0 }}>الرفع وقف: {syncErr}</span>}
      </div>

      {!!ord.fresh.length && view !== "orders" && (
        <button className="noprint" onClick={() => setView("orders")} style={{ display: "block", width: "calc(100% - 32px)", margin: "0 16px 10px", padding: 14, borderRadius: 12, border: 0, background: "var(--bad)", color: "#fff", fontSize: 17, fontWeight: 800, cursor: "pointer" }}>
          🔔 {ord.fresh.length === 1 ? "طلب أونلاين جديد" : `${ord.fresh.length} طلبات أونلاين جديدة`} — دوس هنا
        </button>
      )}
      {view === "orders" && <OrdersPanel sb={sb} orders={ord.orders} ack={ord.ack} reload={ord.load} online={online} />}

      {view === "sell" && (
        <div className="pos noprint" style={{ padding: "0 16px 16px" }}>
          <div className="card" style={{ border: "2px solid var(--y)" }}>
            <ScanInput onScan={onScan} placeholder="امسح QR العلبة أو باركود الصنف أو ملصق الميزان" />
            {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
            <table>
              <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td><b>{l.name}</b>{l.box_sn && <span className="muted num"> #{l.box_sn}</span>}</td>
                    <td className="num">{l.box_sn || !Number.isInteger(l.qty) ? `${l.qty} ${l.unit}` : (
                      <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <button className="btn" style={{ height: 28, width: 28, padding: 0 }} onClick={() => setLines((L) => L.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>−</button>
                        {l.qty}
                        <button className="btn" style={{ height: 28, width: 28, padding: 0 }} onClick={() => setLines((L) => L.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))}>+</button>
                      </span>)}</td>
                    <td className="num">{f2(l.unit_price)}</td>
                    <td className="num"><b>{f2(r2(l.qty * l.unit_price))}</b></td>
                    <td><button className="btn" style={{ height: 28 }} onClick={() => setLines((L) => L.filter((_, j) => j !== i))}>×</button></td>
                  </tr>
                ))}
                {!lines.length && <tr><td colSpan={5} className="muted">امسح أول صنف</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card paybox">
            <div className="row" style={{ justifyContent: "space-between" }}><span>المجموع</span><b className="num">{f2(sub)}</b></div>
            {snap?.can_discount && <label className="fld">خصم على الفاتورة (ج)<input value={disc} onChange={(e) => setDisc(e.target.value)} inputMode="decimal" dir="ltr" /></label>}
            <div className="row" style={{ justifyContent: "space-between", fontSize: 22 }}><span>الإجمالي</span><b className="num">{f2(total)}</b></div>
            <label className="fld">كاش<input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="decimal" dir="ltr" placeholder={f2(total)} /></label>
            <div className="row" style={{ gap: 6 }}>{[total, 50, 100, 200, 500].filter((v, i) => i === 0 || v > total).slice(0, 4).map((v, i) => <button key={i} className="btn" onClick={() => setCash(String(Math.ceil(v)))} style={{ height: 34 }}>{i === 0 ? "مظبوط" : v}</button>)}</div>
            <label className="fld">فيزا<input value={card} onChange={(e) => setCard(e.target.value)} inputMode="decimal" dir="ltr" /></label>
            {paid > total && <div className="okmsg">الباقي للعميل: {f2(paid - total)} ج</div>}
            <button className="btn pri" onClick={pay} disabled={!lines.length} style={{ height: 56, fontSize: 18 }}>ادفع {f2(total)} ج</button>
          </div>
        </div>
      )}

      {view === "list" && (
        <div className="card noprint" style={{ margin: "0 16px", overflowX: "auto" }}>
          <table>
            <thead><tr><th>الفاتورة</th><th>الوقت</th><th>الإجمالي</th><th>كاش / فيزا</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              {done.map((s) => (
                <tr key={s.client_id}>
                  <td className="num">{s.no ? `#${s.no}` : s.local_no}</td><td className="num">{hhmm(s.at)}</td><td className="num"><b>{f2(s.total)}</b></td>
                  <td className="num">{f2(s.cash - s.change)} / {f2(s.card)}</td>
                  <td>{s.no ? (s.conflicts?.length ? <span style={{ color: "var(--bad)" }}>اترفعت · {s.conflicts.join("، ")}</span> : "اترفعت ✓") : <span style={{ color: "#b7791f" }}>على الجهاز</span>}</td>
                  <td><button className="btn" style={{ height: 30 }} onClick={() => { setRec(s); setTimeout(() => window.print(), 50); }}>اطبع تاني</button></td>
                </tr>
              ))}
              {!done.length && <tr><td colSpan={6} className="muted">لسه مفيش فواتير في الوردية دي</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {view === "close" && (
        <div className="card noprint" style={{ margin: "0 16px", display: "grid", gap: 10, maxWidth: 560 }}>
          <div>فتحت بـ <b className="num">{f2(shift.opening_cash)}</b> · كاش الفواتير <b className="num">{f2(expected - shift.opening_cash)}</b> · {done.length} فاتورة</div>
          <label className="fld">الكاش اللي في الدرج كام؟<input value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="decimal" dir="ltr" autoFocus /></label>
          <button className="btn pri" style={{ height: 50 }} disabled={counted === ""} onClick={closeShift}>اقفل الوردية</button>
          <div className="muted" style={{ fontSize: 13 }}>لو فيه مصروف اتصرف من الدرج في السيستم، هيتخصم من المتوقع وقت القفل.</div>
        </div>
      )}

      {rec && (
        <div className="receipt onlyprint">
          <div style={{ textAlign: "center" }}><img src="/logo.png" alt="" style={{ width: 120, filter: "invert(1)" }} /><div>{shift.loc_name}</div><div>فاتورة {rec.no ? `#${rec.no}` : rec.local_no} · {new Date(rec.at).toLocaleString("en-GB")}</div></div>
          <table><tbody>{rec.lines.map((l, i) => <tr key={i}><td>{l.name}{l.box_sn ? ` #${l.box_sn}` : ""}<br />{l.qty} × {f2(l.unit_price)}</td><td style={{ textAlign: "left" }}>{f2(r2(l.qty * l.unit_price))}</td></tr>)}</tbody></table>
          {rec.discount > 0 && <div className="rrow"><span>خصم</span><span>-{f2(rec.discount)}</span></div>}
          <div className="rrow" style={{ fontWeight: 800, fontSize: "12pt" }}><span>الإجمالي</span><span>{f2(rec.total)}</span></div>
          {rec.cash > 0 && <div className="rrow"><span>كاش</span><span>{f2(rec.cash)}</span></div>}
          {rec.card > 0 && <div className="rrow"><span>فيزا</span><span>{f2(rec.card)}</span></div>}
          {rec.change > 0 && <div className="rrow"><span>الباقي</span><span>{f2(rec.change)}</span></div>}
          <div style={{ textAlign: "center", marginTop: 6 }}>شكرًا لزيارتك — {me.name}</div>
        </div>
      )}
    </>
  );
}
