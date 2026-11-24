"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SettleBox from "@/components/SettleBox";
import CompBox from "@/components/CompBox";
import ScanInput from "@/components/ScanInput";
import ReturnBox, { type Ret } from "@/components/ReturnBox";
import { supabaseBrowser } from "@/lib/supabase/client";
import * as kv from "@/lib/idb";
import OrdersPanel, { useOrders } from "./Orders";
import { ShiftReportView, useShiftReport } from "@/components/ShiftReport";

/* ===== الكاشير (تطبيق بيتثبّت على كمبيوتر الفرع) =====
   قرار شادي: من غير نت البيع بيقف خالص. كل فاتورة بتتسجّل في السيستم الأول، وبعدها بس بتتطبع.
   المسح بيسأل السيستم على طول (pos_lookup)، وملصق الميزان بيتقري من نسخة الفرع اللي بتتحدّث كل دقيقة. */

type Item = { id: number; name: string; unit: string; sold_by: string; arm: string; kind: string; fams?: number[]; plu: string | null; price: number };
type Promo = { id: number; name: string; kind: string; value: number; max_off: number | null; auto: boolean; code: string | null; min_order: number; families: number[] | null; stackable: boolean; ends_at: string | null; bundle?: { item_id: number; qty: number }[] | null };
type Snap = { loc: string; name: string; at: string; refresh_min?: number; can_discount: boolean; can_orders?: boolean; scale: { prefix: string; plu_digits: number; weight_digits: number; decimals: number } | null; items: Item[]; barcodes: { code: string; item_id: number }[]; boxes: { sn: number; item_id: number; weight: number; exp?: string | null }[]; warn_days?: number; can_waste?: boolean; promos?: Promo[]; unknown_item?: number | null; can_unknown?: boolean; can_credit?: boolean; can_return?: boolean; can_void?: boolean; can_due?: boolean; can_settle?: boolean; can_gift?: boolean; can_comp?: boolean };
type Line = { item_id: number; name: string; unit: string; box_sn: number | null; qty: number; unit_price: number; unknown_code?: string; gift?: boolean; list_price?: number };
type Sale = { client_id: string; shift: string; at: string; local_no: string; lines: Line[]; discount: number; cash: number; card: number; offline: boolean; promo_code?: string | null; credit?: number; credit_customer?: number | null; credit_name?: string | null; points_code?: string | null; points?: number; points_off?: number; points_earn?: number };
type Done = Sale & { no?: number; conflicts?: string[]; total: number; change: number; voided?: string; bal_name?: string; bal_use?: number; bal_due?: number; bal_over?: number };
type Shift = { client_id: string; loc: string; loc_name: string; opening_cash: number; opened_at: string; server_id?: number; closing?: { counted: number; closed_at: string } };
type Me = { id: string; name: string; home: string | null };

// ملصق الميزان: البادئة + كود الصنف + الوزن، وبعدها رقم تحقق أو من غيره (بعض الموازين بتطبع 12 رقم)
const isScale = (v: string, sc: { prefix: string; plu_digits: number; weight_digits: number }) => {
  const n = sc.prefix.length + sc.plu_digits + sc.weight_digits;
  return /^\d+$/.test(v) && (v.length === n || v.length === n + 1) && v.startsWith(sc.prefix);
};
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
  const [unk, setUnk] = useState<{ code: string; price: string } | null>(null);
  const addUnk = () => {
    const p = Number(unk?.price.replace(",", "."));
    if (!unk || !(p > 0) || !snap?.unknown_item) return bad("اكتب السعر");
    setLines((L) => [...L, { item_id: snap.unknown_item!, name: `صنف مش معروف ${unk.code}`, unit: "قطعة", box_sn: null, qty: 1, unit_price: p, unknown_code: unk.code }]);
    setMsg({ ok: true, t: `✓ ${unk.code} بسعر ${p} — هيتراجع ويتربط بصنف` }); setUnk(null);
  };
  const [cash, setCash] = useState("");
  // تبديل: قيمة المرتجع بتتحط في الكاش بدل ما تتدفع للعميل
  const [exch, setExch] = useState<{ no: number; amount: number } | null>(null);
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
  // آجل لعميل جملة/شركة
  type CrInfo = { customer_id: number; name: string | null; company: string | null; available: number; balance: number; overdue: number; blocked: string | null };
  // رصيد العميل: يستخدم رصيده / الباقي يتساب رصيد / فاضل عليه
  const [bPhone, setBPhone] = useState("");
  const [bInfo, setBInfo] = useState<{ id: number; name: string; balance: number } | null>(null);
  const [bNew, setBNew] = useState<string | null>(null);
  const [bUse, setBUse] = useState(false);
  const [bKeep, setBKeep] = useState(false);
  const [bDue, setBDue] = useState(false);
  const [bErr, setBErr] = useState<string | null>(null);
  const findBal = async () => {
    setBErr(null); setBNew(null);
    if (!bPhone.trim()) return setBInfo(null);
    const { data, error } = await sb.rpc("pos_customer", { p_phone: bPhone });
    if (error) return setBErr(errText(error));
    const d = data as { found: boolean; id?: number; name?: string; balance?: number };
    if (!d.found) { setBInfo(null); setBNew(""); return; }
    setBInfo({ id: Number(d.id), name: String(d.name ?? ""), balance: Number(d.balance ?? 0) });
  };
  const addBalCust = async () => {
    const { data, error } = await sb.rpc("pos_customer_add", { p_phone: bPhone, p_name: bNew ?? "" });
    if (error) return setBErr(errText(error));
    setBInfo({ id: Number(data), name: bNew || "عميل الفرع", balance: 0 }); setBNew(null);
  };
  const [crPhone, setCrPhone] = useState("");
  const [crAmt, setCrAmt] = useState("");
  const [crInfo, setCrInfo] = useState<CrInfo | null>(null);
  const [crErr, setCrErr] = useState<string | null>(null);
  const findCredit = async () => {
    setCrInfo(null); setCrErr(null);
    if (crPhone.replace(/\D/g, "").length < 10) return;
    const { data, error } = await sb.rpc("credit_check", { p_phone: crPhone });
    if (error) return setCrErr(errText(error));
    setCrInfo(data as CrInfo);
  };
  // نقاط العميل: بكود 6 أرقام من "نقاطي" في التطبيق (من غير تطبيق مفيش نقاط)
  type PtInfo = { name: string; phone_tail: string; tier: string; balance: number; point_value: number; min_redeem: number; max_pct: number; earn_per: number; vip_mult: number; can_redeem: boolean; no_points: boolean };
  const [ptCode, setPtCode] = useState("");
  const [ptInfo, setPtInfo] = useState<PtInfo | null>(null);
  const [ptErr, setPtErr] = useState<string | null>(null);
  const [ptUse, setPtUse] = useState(false);
  const checkPts = async (code = ptCode) => {
    setPtInfo(null); setPtErr(null); setPtUse(false);
    if (code.replace(/\D/g, "").length !== 6) return;
    const { data, error } = await sb.rpc("pos_points_check", { p_code: code.replace(/\D/g, "") });
    if (error) return setPtErr(errText(error));
    setPtInfo(data as PtInfo);
  };
  const [rec, setRec] = useState<Done | null>(null);
  const [view, setView] = useState<"sell" | "orders" | "list" | "return" | "close" | "expiry">("sell");
  // تقرير الوردية من السيستم: بيتحدّث كل ما تفتح «تقرير الوردية» أو «اقفل الوردية»
  const [repTick, setRepTick] = useState(0);
  useEffect(() => { if (view === "close" || view === "list") setRepTick((x) => x + 1); }, [view, done.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const rep = useShiftReport(sb, shift?.server_id, shift?.client_id, repTick);
  const [rets, setRets] = useState<Ret[]>([]);
  // إلغاء فاتورة (Void) في نفس الوردية
  const [voidOf, setVoidOf] = useState<string | null>(null);
  const [voidWhy, setVoidWhy] = useState("");
  const [voidMsg, setVoidMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const doVoid = async (d: Done) => {
    if (!shift || !d.no) return;
    const { data, error } = await sb.rpc("pos_void", { p_no: d.no, p_reason: voidWhy, p_shift_client: shift.client_id });
    if (error) return setVoidMsg({ ok: false, t: errText(error) });
    setRets((x) => [...x, data as Ret]);
    const nd = done.map((x) => (x.client_id === d.client_id ? { ...x, voided: voidWhy } : x));
    setDone(nd); await kv.set("done", nd);
    setVoidOf(null); setVoidWhy("");
    setVoidMsg({ ok: true, t: `اتلغت الفاتورة #${d.no} — ${f2(Number((data as Ret).refund_cash))} ج اتشالوا من الدرج، والأصناف رجعت المخزون` });
  };
  // تبويب الصلاحية: فاضل كام يوم (زي تقرير المخزن)
  const [expDays, setExpDays] = useState<number | null>(null);
  // كاش الطيارين اللي اتسلّم في الوردية دي (بيدخل الدرج)
  const [riderIn, setRiderIn] = useState(0);
  // تسويات العملاء الكاش في الوردية (استلام + / رد − / تعويض كاش)
  const [custTick, setCustTick] = useState(0);
  const [custCash, setCustCash] = useState<{ cash: number; rows: { kind: string; amount: number; cash: number; note: string | null; customers: { name: string; phone: string } | null }[] }>({ cash: 0, rows: [] });
  const [retKey, setRetKey] = useState(0);
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
      const { data, error } = await sb.rpc("pos_sync", { p_loc: sh.loc, p_shifts: shPayload, p_sales: batch.map(({ lines, ...s }) => ({ ...s, lines: lines.map(({ item_id, box_sn, qty, unit_price, unknown_code, gift, list_price }) => ({ item_id, box_sn, qty, unit_price, unknown_code, gift, list_price })) })) });
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
  // وردية مفتوحة لنفس الكاشير على جهاز تاني (أو اتنسيت مفتوحة)
  const [stale, setStale] = useState<Shift | null>(null);
  const findOpen = async (): Promise<Shift | null> => {
    if (!me) return null;
    const { data } = await sb.from("shifts").select("id,client_id,location_id,opening_cash,opened_at").eq("cashier", me.id).eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;
    return { client_id: data.client_id, loc: data.location_id, loc_name: locs.find((l) => l.id === data.location_id)?.name ?? data.location_id, opening_cash: Number(data.opening_cash) || 0, opened_at: data.opened_at, server_id: data.id };
  };
  useEffect(() => { if (booted && me && !shift && online) findOpen().then(setStale); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [booted, me?.id, shift, online, locs.length]);
  const resumeShift = async (sh: Shift) => {
    await kv.set("shift", sh); await kv.set("done", []); setShift(sh); setDone([]); setOpenErr(null); setStale(null);
    await refreshSnap(sh.loc);
  };
  const openShift = async () => {
    const loc = openLoc || me?.home || locs[0]?.id;
    if (!loc) return;
    if (!navigator.onLine) return setOpenErr(OFF);
    const old = await findOpen();
    if (old) { setStale(old); return setOpenErr(null); }
    const sh: Shift = { client_id: uuid(), loc, loc_name: locs.find((l) => l.id === loc)?.name ?? loc, opening_cash: Number(openCash) || 0, opened_at: new Date().toISOString() };
    setWorking(true);
    const { data, error } = await sb.rpc("pos_sync", { p_loc: loc, p_shifts: [{ client_id: sh.client_id, opening_cash: sh.opening_cash, opened_at: sh.opened_at }], p_sales: [] });
    setWorking(false);
    if (error) {
      if (/one_open_shift/.test(error.message ?? "")) { const o = await findOpen(); if (o) { setStale(o); return setOpenErr(null); } }
      return setOpenErr(errText(error));
    }
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
    if (sc && isScale(v, sc)) {
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
      // صلاحيتها خلصت: ممنوع تتباع
      if (b.exp && new Date(b.exp).getTime() < Date.now()) return `⛔ صلاحية العلبة #${sn} خلصت — متتباعش، حطها على جنب وبلّغ المسؤول`;
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
    if (sc && isScale(code.trim(), sc)) l = lookup(code); // ملصق الميزان
    else {
      const { data, error } = await sb.rpc("pos_lookup", { p_loc: shift.loc, p_code: code });
      const r = (Array.isArray(data) ? data[0] : data) as { item_id: number; item_name: string; unit: string; box_sn: number | null; qty: number; unit_price: number } | undefined;
      if (!error && !r && snap?.unknown_item && /^\d{6,14}$/.test(code.trim())) {
        // باركود مش معروف: يتباع بسعر يدوي (بصلاحية) ويتسجّل عشان يتربط بصنف بعدين
        if (!snap.can_unknown) return bad(`الباركود ${code} مش متسجّل — نادي المدير أو حطه على جنب`);
        setUnk({ code: code.trim(), price: "" }); return;
      }
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
      if (p.kind === "bundle") {
        // باقة: كام باقة كاملة × (سعر أصنافها - سعر الباقة)
        const B = p.bundle ?? []; if (!B.length) continue;
        const q = (id: number) => lines.filter((l) => l.item_id === id).reduce((a, l) => a + l.qty, 0);
        const pr = (id: number) => Math.max(0, ...lines.filter((l) => l.item_id === id).map((l) => l.unit_price));
        const sets = Math.min(...B.map((b) => Math.floor(q(b.item_id) / Number(b.qty))));
        if (!(sets >= 1)) continue;
        let amt = Math.max(r2(sets * (B.reduce((a, b) => a + Number(b.qty) * pr(b.item_id), 0) - Number(p.value))), 0);
        if (p.max_off != null) amt = Math.min(amt, Number(p.max_off));
        if (amt <= 0) continue;
        if (p.stackable) { stack += amt; names.push(p.name); if (!p.auto) codeOk = true; }
        else if (amt > best) { best = amt; bestN = p.name; codeOk = !p.auto || codeOk; }
        continue;
      }
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
  const ptMax = ptInfo && ptUse && ptInfo.can_redeem ? Math.min(ptInfo.balance, Math.floor((total * ptInfo.max_pct / 100) / (Number(ptInfo.point_value) || 1))) : 0;
  const ptOff = r2(ptMax * (Number(ptInfo?.point_value) || 0));
  const ptEarn = ptInfo && !ptInfo.no_points && !crInfo ? Math.floor(Math.max(total - ptOff, 0) / (Number(ptInfo.earn_per) || 10) * (ptInfo.tier === "vip" ? Number(ptInfo.vip_mult) || 1 : 1)) : 0;
  const cr = crInfo ? (crAmt === "" ? Math.max(total - (Number(card) || 0) - st - ptOff - (Number(cash) || 0), 0) : Number(crAmt) || 0) : 0;
  const bUseAmt = bInfo && bUse && bInfo.balance > 0 ? Math.min(bInfo.balance, Math.max(r2(total - (Number(card) || 0) - st - cr - ptOff), 0)) : 0;
  const paid0 = (Number(cash) || 0) + (Number(card) || 0) + st + cr + ptOff + bUseAmt;
  const bDueAmt = bInfo && bDue && cash !== "" && paid0 < total ? r2(total - paid0) : 0;
  const bOverAmt = bInfo && bKeep && paid0 > total ? r2(paid0 - total) : 0;
  const paid = paid0 + bDueAmt - bOverAmt;
  const pay = async () => {
    if (!shift || !lines.length) return bad("الفاتورة فاضية");
    if (!navigator.onLine) return bad(OFF);
    const k = Number(card) || 0;
    if (stAmt && !stInfo) return bad("دوّر على الموظف برقم موبايله الأول");
    if (st > total - k) return bad("المبلغ على حساب الموظف أكبر من الباقي من الفاتورة");
    if (stInfo && st > stInfo.available) return bad(`المتاح للموظف ${f2(stInfo.available)} ج بس`);
    if (crPhone && !crInfo) return bad("دوّر على عميل الآجل برقمه الأول");
    if (crInfo?.blocked) return bad(`مينفعش آجل: ${crInfo.blocked}`);
    if (crInfo && cr > crInfo.available) return bad(`المتاح آجل للعميل ${f2(crInfo.available)} ج بس`);
    if (cr + st > total - k) return bad("الآجل أكبر من الباقي من الفاتورة");
    if (ptCode && !ptInfo) return bad("اتأكد من كود النقاط الأول");
    if ((bUse || bKeep || bDue) && !bInfo) return bad("دوّر على العميل برقم موبايله الأول (رصيد العميل)");
    const c = cash ? Number(cash) || 0 : Math.max(total - k - st - cr - ptOff - bUseAmt, 0);
    if (c + k + st + cr + ptOff + bUseAmt + bDueAmt < total) return bad(`المدفوع أقل من الإجمالي (${f2(total)} ج) — لو العميل هيكمّل بعدين علّم «فاضل عليه»`);
    if (k > total) return bad("الفيزا أكتر من الإجمالي");
    const s: Sale = { client_id: uuid(), shift: shift.client_id, at: new Date().toISOString(), local_no: "", lines, discount: d, cash: c, card: k, offline: false, promo_code: pcode.trim().toUpperCase() || null, credit: cr, credit_customer: crInfo?.customer_id ?? null, credit_name: crInfo ? crInfo.company ?? crInfo.name : null, points_code: ptInfo ? ptCode.replace(/\D/g, "") : null, points: ptMax, points_off: ptOff, points_earn: ptEarn };
    setWorking(true);
    const { data, error } = await sb.rpc("pos_sync", { p_loc: shift.loc, p_shifts: [{ client_id: shift.client_id, opening_cash: shift.opening_cash, opened_at: shift.opened_at }],
      p_sales: [{ ...s, staff: st, staff_id: stInfo?.id ?? null, bal_cust: bInfo?.id ?? null, bal_use: bUseAmt, bal_due: bDueAmt, bal_over: bOverAmt, lines: lines.map(({ item_id, box_sn, qty, unit_price, unknown_code, gift, list_price }) => ({ item_id, box_sn, qty, unit_price, unknown_code, gift, list_price })) }] });
    setWorking(false);
    if (error) return bad(`الفاتورة ماتسجلتش: ${errText(error)}`);
    const r = (data as { sales: { no: number; conflicts?: string[] }[] }).sales[0];
    const dn: Done = { ...s, no: r?.no, conflicts: r?.conflicts ?? [], total: totalOf(s), change: r2(Math.max(c + k + st + cr + ptOff + bUseAmt + bDueAmt - bOverAmt - totalOf(s), 0)), bal_name: bInfo?.name, bal_use: bUseAmt, bal_due: bDueAmt, bal_over: bOverAmt };
    const all = [dn, ...((await kv.get<Done[]>("done")) ?? [])].slice(0, 300); await kv.set("done", all); setDone(all);
    setRec(dn); setLines([]); setDisc(""); setPcode(""); setCash(""); setExch(null); setCard(""); setStPhone(""); setStAmt(""); setStInfo(null); setCrPhone(""); setCrAmt(""); setCrInfo(null); setPtCode(""); setPtInfo(null); setPtUse(false); setMsg(null); setBPhone(""); setBInfo(null); setBUse(false); setBKeep(false); setBDue(false); setBNew(null);
    setTimeout(() => window.print(), 80);
  };

  useEffect(() => {
    const sid = shift?.server_id; if (!sid || !online) return;
    const f = () => {
      sb.from("rider_cash").select("amount").eq("shift_id", sid).then(({ data }) => setRiderIn(r2((data ?? []).reduce((a, x) => a + Number(x.amount), 0))));
      sb.from("cust_balance").select("kind,amount,cash,note,customers(name,phone)").eq("shift_id", sid).order("at").then(({ data }) => {
        const rows = (data ?? []) as unknown as { kind: string; amount: number; cash: number; note: string | null; customers: { name: string; phone: string } | null }[];
        setCustCash({ cash: r2(rows.reduce((a, x) => a + Number(x.cash), 0)), rows });
      });
    };
    f(); const t = setInterval(f, 30000); return () => clearInterval(t);
  }, [shift?.server_id, online, view, custTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- قفل الوردية ----------
  const retCash = rets.reduce((a, r) => a + Number(r.refund_cash), 0);
  // الصلاحية في الفرع: اللي خلص أو هيخلص خلال أيام التنبيه (من آخر تحديث للعلب)
  const expList = (snap?.boxes ?? []).filter((b) => b.exp && new Date(b.exp).getTime() < Date.now() + (expDays ?? snap?.warn_days ?? 1) * 864e5).sort((a, b) => String(a.exp).localeCompare(String(b.exp)));
  const expGone = expList.filter((b) => new Date(String(b.exp)).getTime() < Date.now()).length;
  const expN = expList.length;
  const expected = shift ? r2(shift.opening_cash + done.reduce((a, s) => a + s.cash - s.change, 0) - retCash + riderIn + custCash.cash) : 0;
  const [closeErr, setCloseErr] = useState<string | null>(null);
  const closeShift = async () => {
    if (!shift) return;
    if (!navigator.onLine) return setCloseErr(OFF);
    // من غير عدّ الدرج: اللي اتحصّل كاش في الوردية بيتسجّل عهدة على الكاشير
    const sh = { ...shift, closing: { counted: expected, closed_at: new Date().toISOString() } };
    setWorking(true);
    const { error } = await sb.rpc("pos_sync", { p_loc: sh.loc, p_shifts: [{ client_id: sh.client_id, opening_cash: sh.opening_cash, opened_at: sh.opened_at, counted: sh.closing.counted, closed_at: sh.closing.closed_at }], p_sales: [] });
    setWorking(false);
    if (error) return setCloseErr(errText(error));
    const diff = r2(sh.closing.counted - expected);
    setCloseErr(null); setCounted("");
    await kv.del("shift"); await kv.set("done", []); setShift(null); setDone([]); setView("sell");
    void diff;
    setMsg({ ok: true, t: `الوردية اتقفلت — معاك ${f2(r2(expected - sh.opening_cash))} ج كاش اتضافوا لعهدتك` });
  };

  // ---------- الشاشات ----------
  const bar = (
    <div className="noprint" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#0d0d0d", color: "#fff", padding: "10px 16px" }}>
      <img src="/logo.png" alt="" style={{ height: 26 }} />
      <b style={{ color: "#f5c800" }}>الكاشير</b>
      {me && <span style={{ fontWeight: 700 }}>👤 {me.name}</span>}
      {shift && <span style={{ background: "#f5c800", color: "#0d0d0d", borderRadius: 99, padding: "2px 12px", fontWeight: 800 }}>فرع {shift.loc_name} · وردية من {new Date(shift.opened_at).toDateString() === new Date().toDateString() ? hhmm(shift.opened_at) : new Date(shift.opened_at).toLocaleString("ar-EG", { day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
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
        {stale && (
          <div className="card" style={{ display: "grid", gap: 10, borderColor: "#FFD21F" }}>
            <b>عندك وردية لسه مفتوحة في {stale.loc_name}</b>
            <div style={{ opacity: 0.8 }}>اتفتحت {new Date(stale.opened_at).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })} — الكاش أولها {f2(stale.opening_cash)}. مينفعش تفتح وردية جديدة قبل ما تقفلها.</div>
            <button className="btn pri" style={{ height: 48 }} onClick={() => resumeShift(stale)}>كمّل في الوردية دي</button>
            <div style={{ fontSize: 13, opacity: 0.7 }}>لو عايز تشتغل في فرع تاني: كمّل فيها، اقفلها من «قفل الوردية»، وبعدين افتح الجديدة.</div>
          </div>
        )}
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <label className="fld">الفرع<select value={openLoc} onChange={(e) => setOpenLoc(e.target.value)}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <div className="muted" style={{ fontSize: 13 }}>الوردية بتبدأ من دلوقتي ({new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}) — من غير عدّ الدرج. وفي الآخر هيطلعلك تقرير بكل أوردر والكاش اللي معاك.</div>
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
        {([["sell", "البيع"], ...(snap?.can_orders ? [["orders", `طلبات الأونلاين (${ord.orders.length})`]] : []), ["list", `تقرير الوردية (${done.length})`], ...(snap?.can_return ? [["return", `مرتجع${rets.length ? ` (${rets.length})` : ""}`]] : []), ["expiry", `الصلاحية${expN ? ` (${expN})` : ""}`], ["close", "اقفل الوردية"]] as [typeof view, string][]).map(([k, l]) => <button key={k} className={view === k ? "btn pri" : "btn"} style={(k === "orders" && ord.fresh.length) || (k === "expiry" && expGone) ? { background: "var(--bad)", color: "#fff", borderColor: "var(--bad)" } : undefined} onClick={() => setView(k)}>{l}</button>)}
        <button className="btn" onClick={() => shift && refreshSnap(shift.loc)} disabled={!online}>حدّث الأسعار والعلب</button>
        {syncErr && <span className="badmsg" style={{ margin: 0 }}>الرفع وقف: {syncErr}</span>}
      </div>

      {!!ord.fresh.length && view !== "orders" && (
        <button className="noprint" onClick={() => setView("orders")} style={{ display: "block", width: "calc(100% - 32px)", margin: "0 16px 10px", padding: 14, borderRadius: 12, border: 0, background: "var(--bad)", color: "#fff", fontSize: 17, fontWeight: 800, cursor: "pointer" }}>
          🔔 {ord.fresh.length === 1 ? "طلب أونلاين جديد" : `${ord.fresh.length} طلبات أونلاين جديدة`} — دوس هنا
        </button>
      )}
      {view === "return" && (
        <div style={{ padding: "0 16px" }}>
          {online ? <ReturnBox key={retKey} shiftClient={shift?.client_id} onDone={(r) => setRets((x) => [...x, r])} onClose={() => setRetKey((k) => k + 1)} onExchange={(r) => { setExch({ no: r.no, amount: Number(r.refund_cash) }); setCash(String(r.refund_cash)); setRetKey((k) => k + 1); setView("sell"); }} /> : <div className="badmsg">المرتجع محتاج نت</div>}
          {riderIn > 0 && <div className="muted" style={{ marginTop: 8 }}>كاش استلمته من الطيارين في الوردية دي: {f2(riderIn)} ج — اتضاف للمتوقع في الدرج</div>}
          {rets.length > 0 && <div className="muted" style={{ marginTop: 8 }}>مرتجعات الوردية: {rets.map((r) => `R-${r.no} (${f2(r.total)} ج)`).join(" · ")} — الكاش اللي اترجع {f2(retCash)} ج اتخصم من المتوقع في الدرج</div>}
        </div>)}
      {view === "expiry" && (
        <div style={{ padding: "0 16px" }}>
          <div className="card" style={{ display: "grid", gap: 6 }}>
            <b>الصلاحية في الفرع ({expN})</b>
            <div className="row" style={{ gap: 6 }}>
              {[[0, "اللي خلص بس"], [1, "فاضل يوم"], [2, "فاضل يومين"], [3, "3 أيام"], [7, "أسبوع"]].map(([d, l]) => (
                <button key={d} className={(expDays ?? snap?.warn_days ?? 1) === d ? "btn pri" : "btn"} style={{ height: 34 }} onClick={() => setExpDays(Number(d))}>{l}</button>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>اللي صلاحيته خلصت الكاشير بيرفضه لو اتمسح. حط الأطباق دي على جنب{snap?.can_waste ? " وحوّلها هالك أو تبرعات من الداشبورد" : " وبلّغ المسؤول يحوّلها هالك أو تبرعات"}. (حسب آخر تحديث {snap ? hhmm(snap.at) : ""})</div>
            {expList.map((b) => { const gone = new Date(String(b.exp)).getTime() < Date.now(); const h = Math.round((new Date(String(b.exp)).getTime() - Date.now()) / 36e5); return (
              <div key={b.sn} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", padding: "6px 0", color: gone ? "var(--bad)" : "#b7791f" }}>
                <span><b className="num">#{b.sn}</b> · {snap?.items.find((i) => i.id === b.item_id)?.name ?? ""} · <span className="num">{b.weight}</span></span>
                <b>{gone ? `خلصت من ${Math.abs(h) >= 24 ? `${Math.floor(Math.abs(h) / 24)} يوم` : `${Math.abs(h)} ساعة`}` : `فاضل ${h >= 24 ? `${Math.floor(h / 24)} يوم` : `${h} ساعة`}`}</b>
              </div>); })}
            {!expN && <div className="muted">مفيش حاجة صلاحيتها خلصت أو قربت 👍</div>}
            {snap?.can_waste && shift && <a className="btn pri" href={`/stock/expiry?loc=${shift.loc}`} target="_blank" rel="noreferrer" style={{ display: "inline-grid", placeItems: "center", justifySelf: "start" }}>حوّلهم هالك / تبرعات</a>}
          </div>
        </div>
      )}
      {view === "orders" && <OrdersPanel sb={sb} orders={ord.orders} ack={ord.ack} reload={ord.load} online={online} loc={shift?.loc ?? ""} shiftClient={shift?.client_id ?? null} />}

      {view === "sell" && !online && (
        <div className="noprint" style={{ margin: "0 16px 10px", padding: 18, borderRadius: 12, background: "var(--bad)", color: "#fff", fontSize: 19, fontWeight: 800, textAlign: "center" }}>
          {OFF}
        </div>
      )}
      {view === "sell" && exch && (
        <div className="okmsg" style={{ margin: "0 16px 8px" }}>🔁 تبديل من مرتجع R-{exch.no}: {f2(exch.amount)} ج اتحطوا في خانة الكاش — امسح الصنف الجديد، والعميل يدفع الفرق بس (أو ياخد الباقي). <button className="btn" style={{ height: 28 }} onClick={() => { setExch(null); setCash(""); }}>إلغاء التبديل</button></div>
      )}
      {view === "sell" && (
        <div className="pos noprint" style={{ padding: "0 16px 16px" }}>
          <div className="card" style={{ border: "2px solid var(--y)" }}>
            <ScanInput onScan={onScan} placeholder="امسح QR العلبة أو باركود الصنف أو ملصق الميزان" />
            {unk && (
              <div className="row" style={{ gap: 6, marginTop: 6, alignItems: "center", background: "#FFF7E6", padding: 8, borderRadius: 10 }}>
                <span>الباركود <b dir="ltr">{unk.code}</b> مش متسجّل — بيعه بسعر:</span>
                <input autoFocus inputMode="decimal" dir="ltr" value={unk.price} onChange={(e) => setUnk({ ...unk, price: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") addUnk(); }} style={{ width: 90 }} />
                <button className="btn pri" onClick={addUnk}>ضيف</button><button className="btn" onClick={() => setUnk(null)}>لا</button>
              </div>
            )}
            {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
            <table>
              <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td><b>{l.name}</b>{l.box_sn && <span className="muted num"> #{l.box_sn}</span>}{l.gift && <div style={{ color: "var(--good)", fontSize: 12.5, fontWeight: 700 }}>🎁 هدية (سعرها {f2(r2(l.qty * (l.list_price ?? 0)))})</div>}</td>
                    <td className="num">{l.box_sn || !Number.isInteger(l.qty) ? `${l.qty} ${l.unit}` : (
                      <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <button className="btn" style={{ height: 28, width: 28, padding: 0 }} onClick={() => setLines((L) => L.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>−</button>
                        {l.qty}
                        <button className="btn" style={{ height: 28, width: 28, padding: 0 }} onClick={() => setLines((L) => L.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))}>+</button>
                      </span>)}</td>
                    <td className="num">{f2(l.unit_price)}</td>
                    <td className="num"><b>{f2(r2(l.qty * l.unit_price))}</b></td>
                    <td className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      {snap?.can_gift && !l.unknown_code && <button className={l.gift ? "btn pri" : "btn"} title="هدية ببلاش للعميل" style={{ height: 28, padding: "0 6px" }} onClick={() => setLines((L) => L.map((x, j) => (j === i ? (x.gift ? { ...x, gift: false, unit_price: x.list_price ?? x.unit_price, list_price: undefined } : { ...x, gift: true, list_price: x.unit_price, unit_price: 0 }) : x)))}>🎁</button>}
                      <button className="btn" style={{ height: 28 }} onClick={() => setLines((L) => L.filter((_, j) => j !== i))}>×</button></td>
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
            <details open={!!ptCode}>
              <summary style={{ cursor: "pointer" }}>نقاط العميل (كود من التطبيق) {ptInfo ? `— ${ptInfo.name}` : ""}</summary>
              <input value={ptCode} onChange={(e) => { setPtCode(e.target.value); if (e.target.value.replace(/\D/g, "").length === 6) checkPts(e.target.value); else setPtInfo(null); }} placeholder="الكود 6 أرقام" inputMode="numeric" dir="ltr" style={{ marginTop: 6, width: "100%", letterSpacing: 4, fontSize: 18 }} />
              {ptInfo && <div className="muted">{ptInfo.name} (…{ptInfo.phone_tail}) — رصيده {ptInfo.balance} نقطة{ptEarn > 0 ? ` · هيكسب ${ptEarn} نقطة` : ""}{ptInfo.no_points ? " · حساب جملة مابياخدش نقاط" : ""}</div>}
              {ptInfo && (ptInfo.can_redeem
                ? <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={ptUse} onChange={(e) => setPtUse(e.target.checked)} /> استبدل {ptUse ? `${ptMax} نقطة = ${f2(ptOff)} ج` : "نقاط على الفاتورة دي"}</label>
                : <div className="muted" style={{ fontSize: 12 }}>الاستبدال من أول {ptInfo.min_redeem} نقطة</div>)}
              <div className="muted" style={{ fontSize: 12 }}>العميل يفتح «نقاطي» في التطبيق ← «كود الفرع». من غير التطبيق مفيش نقاط.</div>
              {ptErr && <div className="badmsg">{ptErr}</div>}
            </details>
            {snap?.can_credit && (
              <details open={!!crPhone}>
                <summary style={{ cursor: "pointer" }}>آجل لعميل جملة/شركة {crInfo ? `— ${crInfo.company ?? crInfo.name}` : ""}</summary>
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <input value={crPhone} onChange={(e) => { setCrPhone(e.target.value); setCrInfo(null); }} onBlur={findCredit} placeholder="موبايل العميل" inputMode="tel" dir="ltr" style={{ flex: 1 }} />
                  <input value={crAmt} onChange={(e) => setCrAmt(e.target.value)} placeholder={crInfo ? f2(cr) : "المبلغ"} inputMode="decimal" dir="ltr" style={{ width: 90 }} />
                </div>
                {crInfo && (crInfo.blocked ? <div className="badmsg">{crInfo.blocked}</div>
                  : <div className="muted">رصيده {f2(crInfo.balance)} ج — المتاح {f2(crInfo.available)} ج{crInfo.overdue > 0 ? ` · متأخر ${f2(crInfo.overdue)} ج` : ""}</div>)}
                <div className="muted" style={{ fontSize: 12 }}>لو سبت المبلغ فاضي، الباقي كله بيتسجّل آجل.</div>
                {crErr && <div className="badmsg">{crErr}</div>}
              </details>)}
            <details open={!!bPhone}>
              <summary style={{ cursor: "pointer" }}>رصيد العميل {bInfo ? `— ${bInfo.name} (${bInfo.balance >= 0 ? `ليه ${f2(bInfo.balance)}` : `عليه ${f2(-bInfo.balance)}`} ج)` : "(دفع زيادة / أقل / رصيد)"}</summary>
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <input value={bPhone} onChange={(e) => { setBPhone(e.target.value); setBInfo(null); }} onBlur={findBal} placeholder="موبايل العميل" inputMode="tel" dir="ltr" style={{ flex: 1 }} />
                <button className="btn" onClick={findBal} style={{ height: 40 }}>دوّر</button>
              </div>
              {bNew !== null && (
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <input value={bNew} onChange={(e) => setBNew(e.target.value)} placeholder="عميل جديد — اسمه" style={{ flex: 1 }} />
                  <button className="btn pri" onClick={addBalCust} style={{ height: 40 }}>سجّله</button>
                </div>
              )}
              {bInfo && (
                <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                  {bInfo.balance > 0 && <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={bUse} onChange={(e) => setBUse(e.target.checked)} /> يدفع من رصيده ({f2(Math.min(bInfo.balance, total))} ج)</label>}
                  <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={bKeep} onChange={(e) => { setBKeep(e.target.checked); if (e.target.checked) setBDue(false); }} /> دفع زيادة — الباقي يتساب رصيد ليه بدل ما ياخده</label>
                  {snap?.can_due && <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={bDue} onChange={(e) => { setBDue(e.target.checked); if (e.target.checked) setBKeep(false); }} /> دفع أقل — الباقي يتسجّل عليه (اكتب اللي دفعه في خانة الكاش)</label>}
                  {bUseAmt > 0 && <div className="muted">هيتخصم من رصيده {f2(bUseAmt)} ج</div>}
                  {bOverAmt > 0 && <div className="okmsg">هيتساب رصيد للعميل: {f2(bOverAmt)} ج (مش هياخد باقي)</div>}
                  {bDueAmt > 0 && <div className="badmsg">هيتسجّل على العميل: {f2(bDueAmt)} ج لحد ما يسدّد</div>}
                  {bInfo.balance !== 0 && online && (
                    <details style={{ marginTop: 4 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>سوّي رصيده من غير فاتورة</summary>
                      <SettleBox key={bInfo.id + ":" + bInfo.balance} customerId={bInfo.id} balance={bInfo.balance} shiftClient={shift?.client_id ?? null} onDone={(b) => { setBInfo({ ...bInfo, balance: b }); setCustTick((x) => x + 1); }} />
                    </details>
                  )}
                  {snap?.can_comp && online && (
                    <details style={{ marginTop: 4 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>تعويض للعميل (فلوس / أصناف / هدية)</summary>
                      <CompBox customerId={bInfo.id} shiftClient={shift?.client_id ?? null} onDone={() => { setCustTick((x) => x + 1); findBal(); }} />
                    </details>
                  )}
                </div>
              )}
              {bErr && <div className="badmsg">{bErr}</div>}
            </details>
            {paid > total && <div className="okmsg">الباقي للعميل: {f2(paid - total)} ج</div>}
            <button className="btn pri" onClick={pay} disabled={!lines.length || !online || working} style={{ height: 56, fontSize: 18 }}>{working ? "بيسجّل…" : `ادفع ${f2(total)} ج`}</button>
          </div>
        </div>
      )}

      {view === "list" && (
        <div className="card noprint" style={{ margin: "0 16px", overflowX: "auto" }}>
          {rep.r ? <ShiftReportView r={rep.r} /> : <div className="muted">{rep.err ?? "بيحمّل التقرير…"}</div>}
          <h2 style={{ marginTop: 14 }}>فواتير الكاشير (للإلغاء والطباعة)</h2>
          <table>
            <thead><tr><th>الفاتورة</th><th>الوقت</th><th>الإجمالي</th><th>كاش / فيزا</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              {done.map((s) => (
                <tr key={s.client_id}>
                  <td className="num">{s.no ? `#${s.no}` : s.local_no}</td><td className="num">{hhmm(s.at)}</td><td className="num"><b>{f2(s.total)}</b></td>
                  <td className="num">{f2(s.cash - s.change)} / {f2(s.card)}</td>
                  <td>{s.voided ? <span style={{ color: "var(--bad)" }}>⛔ ملغية — {s.voided}</span> : s.no ? (s.conflicts?.length ? <span style={{ color: "var(--bad)" }}>{s.conflicts.join("، ")}</span> : "متسجّلة ✓") : <span style={{ color: "#b7791f" }}>مستنية تترفع</span>}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn" style={{ height: 30 }} onClick={() => { setRec(s); setTimeout(() => window.print(), 50); }}>اطبع تاني</button>
                      {snap?.can_void && s.no && !s.voided && online && voidOf !== s.client_id && <button className="btn" style={{ height: 30, color: "var(--bad)" }} onClick={() => { setVoidOf(s.client_id); setVoidWhy(""); setVoidMsg(null); }}>إلغاء الفاتورة</button>}
                    </div>
                    {voidOf === s.client_id && (
                      <div className="row" style={{ gap: 4, marginTop: 4 }}>
                        <input value={voidWhy} onChange={(e) => setVoidWhy(e.target.value)} placeholder="سبب الإلغاء" autoFocus style={{ height: 32, width: 170 }} />
                        <button className="btn pri" style={{ height: 32, background: "var(--bad)" }} disabled={voidWhy.trim().length < 3} onClick={() => doVoid(s)}>الغيها</button>
                        <button className="btn" style={{ height: 32 }} onClick={() => setVoidOf(null)}>لأ</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!done.length && <tr><td colSpan={6} className="muted">لسه مفيش فواتير في الوردية دي</td></tr>}
            </tbody>
          </table>
          {voidMsg && <div className={voidMsg.ok ? "okmsg" : "badmsg"}>{voidMsg.t}</div>}
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>إلغاء الفاتورة للفواتير اللي في الوردية المفتوحة بس؛ الفواتير القديمة بتتعمل «مرتجع».</div>
        </div>
      )}

      {view === "close" && (
        <div className="card noprint" style={{ margin: "0 16px", display: "grid", gap: 10, maxWidth: 560 }}>
          <h2 style={{ margin: 0 }}>تقرير الوردية</h2>
          {rep.r ? <ShiftReportView r={rep.r} /> : <div className="muted">{rep.err ?? "بيحمّل التقرير…"}</div>}
          {(() => {
            const ov = done.filter((x) => x.bal_over && !x.voided), du = done.filter((x) => x.bal_due && !x.voided);
            const st = custCash.rows.filter((x) => !["over", "under", "use"].includes(x.kind));
            if (!ov.length && !du.length && !st.length) return null;
            const K: Record<string, string> = { settle_in: "سدّد اللي عليه", settle_out: "رجعناله رصيده", comp: "تعويض كاش", refund: "رد مرتجع" };
            return (
              <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 10, display: "grid", gap: 4 }}>
                <b>أرصدة العملاء في الوردية دي</b>
                {ov.map((x) => <div key={x.client_id} style={{ color: "#16a34a" }}>دفع زيادة: {x.bal_name} — {f2(x.bal_over!)} ج اتسابوا رصيد (فاتورة #{x.no ?? x.local_no})</div>)}
                {du.map((x) => <div key={x.client_id} style={{ color: "var(--bad)" }}>دفع أقل: {x.bal_name} — فاضل عليه {f2(x.bal_due!)} ج (فاتورة #{x.no ?? x.local_no})</div>)}
                {st.map((x, i) => <div key={i}>{K[x.kind] ?? x.kind}: {x.customers?.name} — {Number(x.cash) >= 0 ? "دخل الدرج" : "خرج من الدرج"} {f2(Math.abs(Number(x.cash)))} ج</div>)}
                <div className="muted" style={{ fontSize: 12.5 }}>الزيادة فضلت في الدرج ومحسوبة في المتوقع، والأقل مش في الدرج — والاتنين متسجّلين على العميل لحد التسوية.</div>
              </div>
            );
          })()}
          <button className="btn pri" style={{ height: 50 }} disabled={!online || working} onClick={closeShift}>اقفل الوردية — الكاش ده يتضاف لعهدتي</button>
          {(closeErr || !online) && <div className="badmsg">{closeErr ?? OFF}</div>}
          <div className="muted" style={{ fontSize: 13 }}>القفل مش محتاج عدّ الدرج: الكاش اللي اتحصّل في الوردية بيتسجّل عهدة عليك لحد ما تسلّمه.</div>
        </div>
      )}

      {rec && (
        <div className="receipt onlyprint">
          <div style={{ textAlign: "center" }}><img src="/logo.png" alt="" style={{ width: 120, filter: "invert(1)" }} /><div>{shift.loc_name}</div><div>فاتورة {rec.no ? `#${rec.no}` : rec.local_no} · {new Date(rec.at).toLocaleString("en-GB")}</div></div>
          <table><tbody>{rec.lines.map((l, i) => <tr key={i}><td>{l.name}{l.box_sn ? ` #${l.box_sn}` : ""}{l.gift ? " 🎁 هدية" : ""}<br />{l.qty} × {f2(l.unit_price)}</td><td style={{ textAlign: "left" }}>{f2(r2(l.qty * l.unit_price))}</td></tr>)}</tbody></table>
          {rec.discount > 0 && <div className="rrow"><span>خصم</span><span>-{f2(rec.discount)}</span></div>}
          <div className="rrow" style={{ fontWeight: 800, fontSize: "12pt" }}><span>الإجمالي</span><span>{f2(rec.total)}</span></div>
          {rec.cash > 0 && <div className="rrow"><span>كاش</span><span>{f2(rec.cash)}</span></div>}
          {rec.card > 0 && <div className="rrow"><span>فيزا</span><span>{f2(rec.card)}</span></div>}
          {!!rec.points_off && <div className="rrow"><span>نقاط ({rec.points} نقطة)</span><span>{f2(rec.points_off)}</span></div>}
          {!!rec.points_earn && <div className="rrow"><span>كسبت نقاط</span><span>+{rec.points_earn}</span></div>}
          {!!rec.credit && <div className="rrow"><span>آجل على {rec.credit_name ?? "حساب العميل"}</span><span>{f2(rec.credit)}</span></div>}
          {!!rec.credit && <div style={{ marginTop: 10, borderTop: "1px dashed #000", paddingTop: 14, textAlign: "center", fontSize: 12 }}>توقيع المستلم: ..................</div>}
          {!!(rec as Done).bal_use && <div className="rrow"><span>من رصيد {(rec as Done).bal_name}</span><span>{f2((rec as Done).bal_use!)}</span></div>}
          {!!(rec as Done).bal_due && <div className="rrow"><span>فاضل على {(rec as Done).bal_name}</span><span>{f2((rec as Done).bal_due!)}</span></div>}
          {!!(rec as Done).bal_over && <div className="rrow"><span>اتساب رصيد لـ {(rec as Done).bal_name}</span><span>{f2((rec as Done).bal_over!)}</span></div>}
          {rec.change > 0 && <div className="rrow"><span>الباقي</span><span>{f2(rec.change)}</span></div>}
          <div style={{ textAlign: "center", marginTop: 6 }}>شكرًا لزيارتك — {me.name}</div>
        </div>
      )}
    </>
  );
}
