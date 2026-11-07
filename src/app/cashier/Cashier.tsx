"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ScanInput from "@/components/ScanInput";
import { supabaseBrowser } from "@/lib/supabase/client";
import * as kv from "@/lib/idb";
import OrdersPanel, { useOrders } from "./Orders";

/* ===== الكاشير (تطبيق بيتثبّت على كمبيوتر الفرع) =====
   قرار شادي: من غير نت البيع بيقف خالص. كل فاتورة بتتسجّل في السيستم الأول، وبعدها بس بتتطبع.
   المسح بيسأل السيستم على طول (pos_lookup)، وملصق الميزان بيتقري من نسخة الفرع اللي بتتحدّث كل دقيقة. */

type Item = { id: number; name: string; unit: string; sold_by: string; arm: string; kind: string; fams?: number[]; plu: string | null; price: number };
type Promo = { id: number; name: string; kind: string; value: number; max_off: number | null; auto: boolean; code: string | null; min_order: number; families: number[] | null; stackable: boolean; ends_at: string | null };
type Snap = { loc: string; name: string; at: string; refresh_min?: number; can_discount: boolean; can_orders?: boolean; scale: { prefix: string; plu_digits: number; weight_digits: number; decimals: number } | null; items: Item[]; barcodes: { code: string; item_id: number }[]; boxes: { sn: number; item_id: number; weight: number }[]; promos?: Promo[] };
type Line = { item_id: number; name: string; unit: string; box_sn: number | null; qty: number; unit_price: number };
type Sale = { client_id: string; shift: string; at: string; local_no: string; lines: Line[]; discount: number; cash: number; card: number; offline: boolean; promo_code?: string | null };
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
  const [pcode, setPcode] = useState("");
  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  // على حساب موظف (بيتخصم من مرتبه)
  const [stPhone, setStPhone] = useState("");
  const [stAmt, setStAmt] = useState("");
  const [stInfo, setStInfo] = useState<{ id: string; name: string; available: number; discount_pct: number } | null>(null);
  const [stErr, setStErr] = useState<string | null>(null);
  const findStaff = async () => {
    setStInfo(null); setStErr(null);
    if (stPhone.replace(/\D/g, "").length < 10) return;
    const { data, error } = await sb.rpc("staff_credit_check", { p_phone: stPhone });
    if (error) return setStErr(errText(error));
    setStInfo(data as { id: string; name: string; available: number; discount_pct: number });
  };
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

  const OFF = "النت قاطع — البيع واقف لحد ما النت يرجع";
  const [working, setWorking] = useState(false);
  const errText = (e: { message?: string } | null) => (e?.message ?? "حصلت مشكلة").replace(/^.*?ERROR:\s*/, "");

  // ---------- فتح الوردية (لازم نت) ----------
  const [openErr, setOpenErr] = useState<string | null>(null);
  const openShift = async () => {
    const loc = openLoc || me?.home || locs[0]?.id;
    if (!loc) return;
    if (!navigator.onLine) return setOpenErr(OFF);
    const sh: Shift = { client_id: uuid(), loc, loc_name: locs.find((l) => l.id === loc)?.name ?? loc, opening_cash: Number(openCash) || 0, opened_at: new Date().toISOString() };
    setWorking(true);
    const { data, error } = await sb.rpc("pos_sync", { p_loc: loc, p_shifts: [{ client_id: sh.client_id, opening_cash: sh.opening_cash, opened_at: sh.opened_at }], p_sales: [] });
    setWorking(false);
    if (error) return setOpenErr(errText(error));
    sh.server_id = (data as { shifts: { id: number }[] }).shifts[0]?.id;
    await kv.set("shift", sh); await kv.set("done", []); setShift(sh); setDone([]); setOpenErr(null);
    await refreshSnap(loc);
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
      // الميزان ممكن يطبع السعر بدل الوزن: الوزن = السعر ÷ سعر الكيلو
      const qty = (sc as { type?: string }).type === "price" ? Math.round((w / it.price) * 1000) / 1000 : w;
      return { item_id: it.id, name: it.name, unit: it.unit, box_sn: null, qty, unit_price: it.price };
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
    if (!navigator.onLine) return bad(OFF);
    if (!shift) return;
    let l: Line | string;
    const sc = snap?.scale;
    if (sc && /^\d{13}$/.test(code.trim()) && code.trim().startsWith(sc.prefix)) l = lookup(code); // ملصق الميزان
    else {
      const { data, error } = await sb.rpc("pos_lookup", { p_loc: shift.loc, p_code: code });
      const r = (Array.isArray(data) ? data[0] : data) as { item_id: number; item_name: string; unit: string; box_sn: number | null; qty: number; unit_price: number } | undefined;
      if (error || !r) l = error ? errText(error) : "الكود ده مش متسجّل";
      else if (r.box_sn && lines.some((x) => x.box_sn === r.box_sn)) l = `العلبة #${r.box_sn} في الفاتورة قبل كده`;
      else l = { item_id: r.item_id, name: r.item_name, unit: r.unit, box_sn: r.box_sn, qty: Number(r.qty), unit_price: Number(r.unit_price) };
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
  const stDisc = stInfo ? r2(sub * (Number(stInfo.discount_pct) || 0) / 100) : 0;
  // العروض: نفس قاعدة السيرفر — الأكبر بس، والمتعلّم "بيتجمع" بيتضاف عليه
  const promo = (() => {
    const code = pcode.trim().toUpperCase();
    let best = 0, bestN = "", stack = 0; const names: string[] = []; let codeOk = false;
    for (const p of snap?.promos ?? []) {
      if (!p.auto && (!code || p.code !== code)) continue;
      if (p.ends_at && new Date(p.ends_at).getTime() < Date.now()) continue;
      if (sub < Number(p.min_order)) continue;
      const base = p.families?.length ? lines.reduce((a, l) => { const it = snap?.items.find((i) => i.id === l.item_id); return a + ((it?.fams ?? []).some((f) => p.families!.includes(f)) ? r2(l.qty * l.unit_price) : 0); }, 0) : sub;
      if (base <= 0) continue;
      let amt = p.kind === "pct" ? r2(base * Number(p.value) / 100) : Math.min(Number(p.value), base);
      if (p.max_off != null) amt = Math.min(amt, Number(p.max_off));
      if (p.stackable) { stack += amt; names.push(p.name); if (!p.auto) codeOk = true; }
      else if (amt > best) { best = amt; bestN = p.name; codeOk = !p.auto || codeOk; }
    }
    if (bestN) names.push(bestN);
    return { amt: Math.min(r2(best + stack), sub), names, codeOk };
  })();
  const d = Math.min((Number(disc) || 0) + stDisc + promo.amt, sub);
  const total = Math.max(r2(sub - d), 0);
  const st = stInfo ? Number(stAmt) || 0 : 0;
  const paid = (Number(cash) || 0) + (Number(card) || 0) + st;
  const pay = async () => {
    if (!shift || !lines.length) return bad("الفاتورة فاضية");
    if (!navigator.onLine) return bad(OFF);
    const k = Number(card) || 0;
    if (stAmt && !stInfo) return bad("دوّر على الموظف برقم موبايله الأول");
    if (st > total - k) return bad("المبلغ على حساب الموظف أكبر من الباقي من الفاتورة");
    if (stInfo && st > stInfo.available) return bad(`المتاح للموظف ${f2(stInfo.available)} ج بس`);
    const c = cash ? Number(cash) || 0 : Math.max(total - k - st, 0);
    if (c + k + st < total) return bad(`المدفوع أقل من الإجمالي (${f2(total)} ج)`);
    if (k > total) return bad("الفيزا أكتر من الإجمالي");
    const s: Sale = { client_id: uuid(), shift: shift.client_id, at: new Date().toISOString(), local_no: "", lines, discount: d, cash: c, card: k, offline: false, promo_code: pcode.trim().toUpperCase() || null };
    setWorking(true);
    const { data, error } = await sb.rpc("pos_sync", { p_loc: shift.loc, p_shifts: [{ client_id: shift.client_id, opening_cash: shift.opening_cash, opened_at: shift.opened_at }],
      p_sales: [{ ...s, staff: st, staff_id: stInfo?.id ?? null, lines: lines.map(({ item_id, box_sn, qty, unit_price }) => ({ item_id, box_sn, qty, unit_price })) }] });
    setWorking(false);
    if (error) return bad(`الفاتورة ماتسجلتش: ${errText(error)}`);
    const r = (data as { sales: { no: number; conflicts?: string[] }[] }).sales[0];
    const dn: Done = { ...s, no: r?.no, conflicts: r?.conflicts ?? [], total: totalOf(s), change: r2(Math.max(c + k + st - totalOf(s), 0)) };
    const all = [dn, ...((await kv.get<Done[]>("done")) ?? [])].slice(0, 300); await kv.set("done", all); setDone(all);
    setRec(dn); setLines([]); setDisc(""); setPcode(""); setCash(""); setCard(""); setStPhone(""); setStAmt(""); setStInfo(null); setMsg(null);
    setTimeout(() => window.print(), 80);
  };

  // ---------- قفل الوردية ----------
  const expected = shift ? r2(shift.opening_cash + done.reduce((a, s) => a + s.cash - s.change, 0)) : 0;
  const [closeErr, setCloseErr] = useState<string | null>(null);
  const closeShift = async () => {
    if (!shift) return;
    if (!navigator.onLine) return setCloseErr(OFF);
    const sh = { ...shift, closing: { counted: Number(counted) || 0, closed_at: new Date().toISOString() } };
    setWorking(true);
    const { error } = await sb.rpc("pos_sync", { p_loc: sh.loc, p_shifts: [{ client_id: sh.client_id, opening_cash: sh.opening_cash, opened_at: sh.opened_at, counted: sh.closing.counted, closed_at: sh.closing.closed_at }], p_sales: [] });
    setWorking(false);
    if (error) return setCloseErr(errText(error));
    const diff = r2(sh.closing.counted - expected);
    setCloseErr(null); setCounted("");
    await kv.del("shift"); await kv.set("done", []); setShift(null); setDone([]); setView("sell");
    setMsg({ ok: diff === 0, t: diff === 0 ? "الوردية اتقفلت — الدرج مظبوط" : `الوردية اتقفلت — ${diff > 0 ? "زيادة" : "عجز"} ${f2(Math.abs(diff))} ج` });
  };

  // ---------- الشاشات ----------
  const bar = (
    <div className="noprint" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#0d0d0d", color: "#fff", padding: "10px 16px" }}>
      <img src="/logo.png" alt="" style={{ height: 26 }} />
      <b style={{ color: "#f5c800" }}>الكاشير</b>
      {shift && <span>{shift.loc_name} · {me?.name} · وردية من {hhmm(shift.opened_at)}</span>}
      <span style={{ marginInlineStart: "auto", padding: "3px 12px", borderRadius: 99, fontWeight: 700, fontSize: 13, background: online ? "#16a34a" : "#dc2626" }}>{online ? "متصل" : "النت قاطع — البيع واقف"}</span>
      {!!outbox.length && <span style={{ fontSize: 13, color: "#f5c800" }}>{syncing ? "بيرفع…" : `${outbox.length} فاتورة قديمة مستنية ترتفع`}</span>}
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
          <button className="btn pri" style={{ height: 52, fontSize: 17 }} onClick={openShift} disabled={!locs.length || !online || working}>{working ? "…" : "افتح الوردية"}</button>
          {!online && <div className="badmsg">{OFF}</div>}
          {openErr && <div className="badmsg">{openErr}</div>}
          {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
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

      {view === "sell" && !online && (
        <div className="noprint" style={{ margin: "0 16px 10px", padding: 18, borderRadius: 12, background: "var(--bad)", color: "#fff", fontSize: 19, fontWeight: 800, textAlign: "center" }}>
          {OFF}
        </div>
      )}
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
            {!!snap?.promos?.length && (
              <div style={{ display: "grid", gap: 4 }}>
                <input value={pcode} onChange={(e) => setPcode(e.target.value)} placeholder="بروموكود" dir="ltr" style={{ textTransform: "uppercase" }} />
                {promo.amt > 0 && <div className="okmsg" style={{ padding: "6px 10px" }}>عرض: {promo.names.join(" + ")} — {f2(promo.amt)} ج</div>}
                {!!pcode.trim() && !promo.codeOk && <div className="muted" style={{ fontSize: 12 }}>الكود مش منطبق على الفاتورة دي</div>}
              </div>
            )}
            {snap?.can_discount && <label className="fld">خصم على الفاتورة (ج)<input value={disc} onChange={(e) => setDisc(e.target.value)} inputMode="decimal" dir="ltr" /></label>}
            <div className="row" style={{ justifyContent: "space-between", fontSize: 22 }}><span>الإجمالي</span><b className="num">{f2(total)}</b></div>
            <label className="fld">كاش<input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="decimal" dir="ltr" placeholder={f2(total)} /></label>
            <div className="row" style={{ gap: 6 }}>{[total, 50, 100, 200, 500].filter((v, i) => i === 0 || v > total).slice(0, 4).map((v, i) => <button key={i} className="btn" onClick={() => setCash(String(Math.ceil(v)))} style={{ height: 34 }}>{i === 0 ? "مظبوط" : v}</button>)}</div>
            <label className="fld">فيزا<input value={card} onChange={(e) => setCard(e.target.value)} inputMode="decimal" dir="ltr" /></label>
            <details>
              <summary style={{ cursor: "pointer" }}>على حساب موظف {stInfo ? `— ${stInfo.name}` : ""}</summary>
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <input value={stPhone} onChange={(e) => { setStPhone(e.target.value); setStInfo(null); }} onBlur={findStaff} placeholder="موبايل الموظف" inputMode="tel" dir="ltr" style={{ flex: 1 }} />
                <input value={stAmt} onChange={(e) => setStAmt(e.target.value)} placeholder="المبلغ" inputMode="decimal" dir="ltr" style={{ width: 90 }} />
              </div>
              {stInfo && <div className="muted">{stInfo.name} — المتاح آجل {f2(stInfo.available)} ج{stDisc > 0 ? ` · خصم موظفين ${stInfo.discount_pct}% = ${f2(stDisc)} ج` : ""}</div>}
              <div className="muted" style={{ fontSize: 12 }}>اكتب موبايل الموظف حتى لو دافع كاش عشان ياخد خصم الموظفين — والمبلغ بس لو على حسابه.</div>
              {stErr && <div className="badmsg">{stErr}</div>}
            </details>
            {paid > total && <div className="okmsg">الباقي للعميل: {f2(paid - total)} ج</div>}
            <button className="btn pri" onClick={pay} disabled={!lines.length || !online || working} style={{ height: 56, fontSize: 18 }}>{working ? "بيسجّل…" : `ادفع ${f2(total)} ج`}</button>
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
                  <td>{s.no ? (s.conflicts?.length ? <span style={{ color: "var(--bad)" }}>{s.conflicts.join("، ")}</span> : "متسجّلة ✓") : <span style={{ color: "#b7791f" }}>مستنية تترفع</span>}</td>
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
          <button className="btn pri" style={{ height: 50 }} disabled={counted === "" || !online || working} onClick={closeShift}>اقفل الوردية</button>
          {(closeErr || !online) && <div className="badmsg">{closeErr ?? OFF}</div>}
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
