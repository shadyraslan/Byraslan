import Link from "next/link";
import { redirect } from "next/navigation";
import {
  PiArrowsLeftRightFill,
  PiChartBarFill,
  PiFactoryFill,
  PiMoneyFill,
  PiPackageFill,
  PiReceiptFill,
  PiShoppingBagOpenFill,
  PiShoppingCartFill,
  PiTruckFill,
} from "react-icons/pi";
import type { IconType } from "react-icons";
import { can, getMe } from "@/lib/perms";
import { cairoDate, cairoDayStart, money } from "@/lib/time";
import { supabaseServer } from "@/lib/supabase/server";
import ReportExport from "./ReportExport";
import styles from "./statistics.module.css";

type Scope = "all" | "sales" | "orders" | "inventory" | "production" | "logistics" | "purchases" | "finance";
type Search = Record<string, string | string[] | undefined>;
type Loaded<T> = { rows: T[]; failed: boolean; truncated: boolean };
type Location = { id: string; name: string; type: string; active: boolean };
type SaleLine = { item_id: number; qty: number; total: number };
type Sale = { id: number; at: string; total: number; discount: number; paid_cash: number; paid_card: number; change: number; location_id: string; cashier: string; sale_lines?: SaleLine[] };
type OrderLine = { item_id: number; qty: number; prepared: number; unit_price: number };
type OnlineOrder = { id: number; status: string; created_at: string; delivered_at: string | null; total: number | null; est_total: number; location_id: string; channel: string; pay_method: string; online_order_lines?: OrderLine[] };
type Box = { sn: number; packed_at: string; weight: number; status: string; location_id: string; item_id: number };
type StockMove = { id: number; at: string; qty: number; kind: string; location_id: string; item_id: number; items?: { name: string } | { name: string }[] | null };
type ProductionStep = { section_id: string; in_weight: number | null; out_weight: number | null; waste: number | null };
type ProductionOrder = { id: number; status: string; created_at: string; qty: number; item_id: number; prod_steps?: ProductionStep[] };
type Transfer = { id: number; status: string; sent_at: string; from_loc: string; to_loc: string };
type Trip = { id: number; status: string; created_at: string; trip_crates?: { to_loc: string }[] };
type PurchaseOrder = { id: number; status: string; created_at: string };
type ReceiptLine = { accepted: number; price: number };
type Receipt = { id: number; at: string; supplier_id: number; result: string; receipt_lines?: ReceiptLine[] };
type Expense = { id: number; day: string; amount: number; status: string; location_id: string; category_id: number; expense_categories?: { name: string } | { name: string }[] | null };
type Balance = { item_id: number; location_id: string; qty: number };
type Named = { id: number | string; name: string; active?: boolean };
type ChartPoint = { key: string; label: string; value: number };
type StatRow = { label: string; count: number | string; value: number | string };
type ExportRow = { section: string; label: string; count: number | string; value: number | string };

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;
const scopes: { id: Scope; label: string }[] = [
  { id: "all", label: "كامل النظام" },
  { id: "sales", label: "المبيعات" },
  { id: "orders", label: "الطلبات الأونلاين" },
  { id: "inventory", label: "المخزون" },
  { id: "production", label: "الإنتاج" },
  { id: "logistics", label: "التوزيع والتحويلات" },
  { id: "purchases", label: "المشتريات" },
  { id: "finance", label: "الحسابات" },
];
const statusLabels: Record<string, string> = {
  new: "جديد", accepted: "مقبول", preparing: "قيد التجهيز", ready: "جاهز", out: "خرج للتوصيل",
  delivered: "تم التوصيل", cancelled: "ملغي", stock: "متاح بالمخزون", loaded: "محمّل",
  transit: "في الطريق", sold: "مباع", waste: "هالك", donated: "تبرعات", missing: "ناقص",
  planned: "مخطط", running: "قيد التنفيذ", done: "مكتمل", waiting: "في الانتظار",
  received: "تم الاستلام", open: "مفتوح", partial: "استلام جزئي", closed: "مغلق",
  ok: "معتمد", pending: "معلق", rejected: "مرفوض", loading: "قيد التحميل",
};
const statusColors = ["#1677e8", "#12b886", "#ff9f43", "#8b5cf6", "#ed5b78", "#06a6a6"];
const kindLabels: Record<string, string> = {
  pack: "تغليف", receive: "استلام مشتريات", sale: "بيع", transfer: "تحويل",
  adjust: "تسوية", waste: "هالك", donate: "تبرعات", count: "جرد", return: "مرتجع", production: "إنتاج",
};

async function readAll<T>(build: (from: number, to: number) => any): Promise<Loaded<T>> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      const { data, error } = await build(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) return { rows, failed: true, truncated: false };
      const batch = (data ?? []) as T[];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) return { rows, failed: false, truncated: false };
    } catch {
      return { rows, failed: true, truncated: false };
    }
  }
  return { rows, failed: false, truncated: true };
}

function emptyLoaded<T>(): Loaded<T> {
  return { rows: [], failed: false, truncated: false };
}

function valueOf(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function shiftDate(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function monthStart(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

function cairoRange(from: string, to: string) {
  const start = cairoDayStart(new Date(`${from}T12:00:00Z`));
  const endExclusive = cairoDayStart(new Date(`${shiftDate(to, 1)}T12:00:00Z`));
  return { start, endExclusive };
}

function formatDay(day: string): string {
  return new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "short" })
    .format(new Date(`${day}T12:00:00Z`));
}

function dayKey(timestamp: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(timestamp));
}

function makeChart(
  entries: { at: string; value: number }[],
  from: string,
  to: string,
  grouping: "day" | "month",
): ChartPoint[] {
  const values = new Map<string, number>();
  for (const entry of entries) {
    const day = dayKey(entry.at);
    const key = grouping === "month" ? day.slice(0, 7) : day;
    values.set(key, (values.get(key) ?? 0) + entry.value);
  }

  const points: ChartPoint[] = [];
  if (grouping === "month") {
    const cursor = new Date(`${from.slice(0, 7)}-01T12:00:00Z`);
    const last = to.slice(0, 7);
    while (cursor.toISOString().slice(0, 7) <= last) {
      const key = cursor.toISOString().slice(0, 7);
      points.push({
        key,
        label: new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", month: "short", year: "2-digit" })
          .format(cursor),
        value: values.get(key) ?? 0,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    for (let cursor = from; cursor <= to; cursor = shiftDate(cursor, 1)) {
      points.push({ key: cursor, label: formatDay(cursor), value: values.get(cursor) ?? 0 });
    }
  }
  return points;
}

function aggregate<T>(
  rows: T[],
  getKey: (row: T) => string,
  getValue: (row: T) => number,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    result.set(key, (result.get(key) ?? 0) + getValue(row));
  }
  return result;
}

function scopeStatusOptions(scope: Scope) {
  const values: Record<Scope, [string, string][]> = {
    all: [],
    sales: [],
    orders: [["new", "جديد"], ["accepted", "مقبول"], ["preparing", "قيد التجهيز"], ["ready", "جاهز"], ["out", "خرج للتوصيل"], ["delivered", "تم التوصيل"], ["cancelled", "ملغي"]],
    inventory: [["stock", "متاح بالمخزون"], ["loaded", "محمّل"], ["transit", "في الطريق"], ["sold", "مباع"], ["waste", "هالك"], ["donated", "تبرعات"], ["missing", "ناقص"]],
    production: [["planned", "مخطط"], ["running", "قيد التنفيذ"], ["done", "مكتمل"], ["cancelled", "ملغي"]],
    logistics: [["transit", "في الطريق"], ["received", "تم الاستلام"], ["loading", "قيد التحميل"], ["out", "خرجت"], ["done", "انتهت"]],
    purchases: [["open", "مفتوح"], ["partial", "استلام جزئي"], ["done", "مكتمل"], ["cancelled", "ملغي"]],
    finance: [["ok", "معتمد"], ["pending", "معلق"], ["rejected", "مرفوض"]],
  };
  return values[scope];
}

function scopeStatusLabel(scope: Scope): string {
  const labels: Partial<Record<Scope, string>> = {
    orders: "حالة الطلب",
    inventory: "حالة العلبة",
    production: "حالة أمر الإنتاج",
    logistics: "حالة التحويل / الرحلة",
    purchases: "حالة أمر التوريد",
    finance: "حالة المصروف",
  };
  return labels[scope] ?? "الحالة";
}

function relationName(value: { name: string } | { name: string }[] | null | undefined): string {
  return Array.isArray(value) ? value[0]?.name ?? "غير محدد" : value?.name ?? "غير محدد";
}

function SummaryPanel({
  title,
  rows,
  countHeading,
  valueHeading,
  empty,
}: {
  title: string;
  rows: StatRow[];
  countHeading: string;
  valueHeading: string;
  empty: string;
}) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>{title}</h2>
      {!rows.length ? <div className={styles.empty}>{empty}</div> : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>البيان</th><th>{countHeading}</th><th>{valueHeading}</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td><td className="num">{row.count}</td><td className="num">{row.value}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function StatisticsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const getParam = (name: string) => {
    const value = params[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const me = await getMe();
  if (!me) redirect("/login");

  const access = {
    sales: can(me, "acc.view") || can(me, "pos.shift"),
    orders: can(me, "acc.view") || can(me, "orders.handle"),
    inventory: can(me, "stock.view"),
    production: can(me, "prod.orders") || can(me, "prod.pack"),
    logistics: can(me, "stock.view") || can(me, "trips.load"),
    purchases: can(me, "purchase.edit") || can(me, "stock.edit"),
    finance: can(me, "acc.view"),
  };
  if (!Object.values(access).some(Boolean)) redirect("/dashboard");
  const availableScopes = scopes.filter(({ id }) => id === "all" || access[id]);
  const requestedScope = getParam("report") as Scope | undefined;
  const scope = availableScopes.some((option) => option.id === requestedScope) ? requestedScope! : "all";
  const requestedStatus = getParam("status") ?? "";
  const status = scopeStatusOptions(scope).some(([value]) => value === requestedStatus) ? requestedStatus : "";
  const grouping = getParam("group") === "day" ? "day" : "month";

  const today = cairoDate();
  const defaultFrom = monthStart(today, -11);
  let from = validDate(getParam("from")) ? getParam("from")! : defaultFrom;
  let to = validDate(getParam("to")) ? getParam("to")! : today;
  let rangeWarning = "";
  if (from > to) {
    [from, to] = [to, from];
    rangeWarning = "تم عكس التاريخين لأن تاريخ البداية كان بعد تاريخ النهاية.";
  }
  if ((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000 > 5 * 366) {
    from = shiftDate(to, -(5 * 366));
    rangeWarning = "تم تحديد أقصى فترة بحث بخمس سنوات للحفاظ على سرعة التقارير.";
  }

  const requestedLocation = getParam("loc") ?? "";
  const sb = await supabaseServer();
  const { data: locationData, error: locationError } = await sb
    .from("locations").select("id,name,type,active").order("sort");
  const locations = (locationData ?? []) as unknown as Location[];
  const location = locations.some((row) => row.id === requestedLocation) ? requestedLocation : "";
  const locationNames = new Map(locations.map((row) => [row.id, row.name]));
  const { start, endExclusive } = cairoRange(from, to);

  const includeSales = access.sales && ["all", "sales", "finance"].includes(scope);
  const includeOrders = access.orders && ["all", "orders", "sales"].includes(scope);
  const includeDeliveredOrders = access.orders && access.sales && ["all", "sales", "finance"].includes(scope);
  const includeInventory = access.inventory && ["all", "inventory"].includes(scope);
  const includeProduction = access.production && ["all", "production"].includes(scope);
  const includeLogistics = access.logistics && ["all", "logistics"].includes(scope);
  const includePurchases = access.purchases && ["all", "purchases", "finance"].includes(scope);
  const includeFinance = access.finance && ["all", "finance"].includes(scope);
  const includeOverview = scope === "all";

  const tasks = await Promise.all([
    includeSales
      ? readAll<Sale>((offset, end) => {
          let query = sb.from("sales")
            .select("id,at,total,discount,paid_cash,paid_card,change,location_id,cashier,sale_lines(item_id,qty,total)")
            .gte("at", start).lt("at", endExclusive);
          if (location) query = query.eq("location_id", location);
          return query.order("at").order("id").range(offset, end);
        })
      : Promise.resolve(emptyLoaded<Sale>()),
    includeOrders
      ? readAll<OnlineOrder>((offset, end) => {
          let query = sb.from("online_orders")
            .select("id,status,created_at,delivered_at,total,est_total,location_id,channel,pay_method,online_order_lines(item_id,qty,prepared,unit_price)")
            .gte("created_at", start).lt("created_at", endExclusive);
          if (location) query = query.eq("location_id", location);
          if (scope === "orders" && status) query = query.eq("status", status);
          return query.order("created_at").order("id").range(offset, end);
        })
      : Promise.resolve(emptyLoaded<OnlineOrder>()),
    includeDeliveredOrders
      ? readAll<OnlineOrder>((offset, end) => {
          let query = sb.from("online_orders")
            .select("id,status,created_at,delivered_at,total,est_total,location_id,channel,pay_method,online_order_lines(item_id,qty,prepared,unit_price)")
            .eq("status", "delivered").gte("delivered_at", start).lt("delivered_at", endExclusive);
          if (location) query = query.eq("location_id", location);
          return query.order("delivered_at").order("id").range(offset, end);
        })
      : Promise.resolve(emptyLoaded<OnlineOrder>()),
    includeInventory
      ? readAll<Box>((offset, end) => {
          let query = sb.from("boxes").select("sn,packed_at,weight,status,location_id,item_id")
            .gte("packed_at", start).lt("packed_at", endExclusive);
          if (location) query = query.eq("location_id", location);
          if (scope === "inventory" && status) query = query.eq("status", status);
          return query.order("packed_at").order("sn").range(offset, end);
        })
      : Promise.resolve(emptyLoaded<Box>()),
    includeInventory
      ? readAll<StockMove>((offset, end) => {
          let query = sb.from("stock_moves").select("id,at,qty,kind,location_id,item_id,items(name)")
            .gte("at", start).lt("at", endExclusive);
          if (location) query = query.eq("location_id", location);
          return query.order("at").order("id").range(offset, end);
        })
      : Promise.resolve(emptyLoaded<StockMove>()),
    includeInventory
      ? readAll<Balance>((offset, end) => {
          let query = sb.from("stock_balance").select("item_id,location_id,qty").gt("qty", 0);
          if (location) query = query.eq("location_id", location);
          return query.order("qty", { ascending: false }).range(offset, end);
        })
      : Promise.resolve(emptyLoaded<Balance>()),
    includeProduction
      ? readAll<ProductionOrder>((offset, end) => {
          const stepsRelation = location ? "prod_steps!inner" : "prod_steps";
          let query = sb.from("prod_orders").select(`id,status,created_at,qty,item_id,${stepsRelation}(section_id,in_weight,out_weight,waste)`)
            .gte("created_at", start).lt("created_at", endExclusive);
          if (scope === "production" && status) query = query.eq("status", status);
          if (location) query = query.eq("prod_steps.section_id", location);
          return query.order("created_at").order("id").range(offset, end);
        })
      : Promise.resolve(emptyLoaded<ProductionOrder>()),
    includeLogistics
      ? readAll<Transfer>((offset, end) => {
          let query = sb.from("transfers").select("id,status,sent_at,from_loc,to_loc")
            .gte("sent_at", start).lt("sent_at", endExclusive);
          if (location) query = query.or(`from_loc.eq.${location},to_loc.eq.${location}`);
          if (scope === "logistics" && ["transit", "received"].includes(status)) query = query.eq("status", status);
          return query.order("sent_at").order("id").range(offset, end);
        })
      : Promise.resolve(emptyLoaded<Transfer>()),
    includeLogistics
      ? readAll<Trip>((offset, end) => {
          const cratesRelation = location ? "trip_crates!inner" : "trip_crates";
          let query = sb.from("trips").select(`id,status,created_at,${cratesRelation}(to_loc)`).gte("created_at", start).lt("created_at", endExclusive);
          if (scope === "logistics" && ["loading", "out", "done"].includes(status)) query = query.eq("status", status);
          if (location) query = query.eq("trip_crates.to_loc", location);
          return query.order("created_at").order("id").range(offset, end);
        })
      : Promise.resolve(emptyLoaded<Trip>()),
    includePurchases
      ? readAll<PurchaseOrder>((offset, end) => {
          let query = sb.from("purchase_orders").select("id,status,created_at")
            .gte("created_at", start).lt("created_at", endExclusive);
          if (scope === "purchases" && status) query = query.eq("status", status);
          return query.order("created_at").order("id").range(offset, end);
        })
      : Promise.resolve(emptyLoaded<PurchaseOrder>()),
    includePurchases && (!location || location === "main")
      ? readAll<Receipt>((offset, end) => sb.from("receipts")
          .select("id,at,supplier_id,result,receipt_lines(accepted,price)")
          .gte("at", start).lt("at", endExclusive).order("at").order("id").range(offset, end))
      : Promise.resolve(emptyLoaded<Receipt>()),
    includeFinance
      ? readAll<Expense>((offset, end) => {
          let query = sb.from("expenses").select("id,day,amount,status,location_id,category_id,expense_categories(name)")
            .gte("day", from).lte("day", to);
          if (location) query = query.eq("location_id", location);
          if (scope === "finance" && status) query = query.eq("status", status);
          return query.order("day").order("id").range(offset, end);
        })
      : Promise.resolve(emptyLoaded<Expense>()),
    includeOverview || includeInventory || includeProduction || includeSales
      ? readAll<Named>((offset, end) => sb.from("items").select("id,name,active").order("id").range(offset, end))
      : Promise.resolve(emptyLoaded<Named>()),
    includeOverview || includeSales
      ? readAll<Named>((offset, end) => sb.from("profiles").select("id,name,active").order("id").range(offset, end))
      : Promise.resolve(emptyLoaded<Named>()),
    includePurchases
      ? readAll<Named>((offset, end) => sb.from("suppliers").select("id,name").order("id").range(offset, end))
      : Promise.resolve(emptyLoaded<Named>()),
  ]);

  const [
    salesResult, ordersResult, deliveredResult, boxesResult, movesResult, balancesResult,
    productionResult, transfersResult, tripsResult, purchasesResult, receiptsResult,
    expensesResult, itemsResult, profilesResult, suppliersResult,
  ] = tasks;
  const results = tasks as Loaded<unknown>[];
  const failed = results.some((result) => result.failed);
  const truncated = results.some((result) => result.truncated);
  const sales = salesResult.rows as Sale[];
  const orders = ordersResult.rows as OnlineOrder[];
  const deliveredOrders = deliveredResult.rows as OnlineOrder[];
  const boxes = boxesResult.rows as Box[];
  const moves = movesResult.rows as StockMove[];
  const balances = balancesResult.rows as Balance[];
  const production = productionResult.rows as ProductionOrder[];
  const transfers = transfersResult.rows as Transfer[];
  const trips = tripsResult.rows as Trip[];
  const purchases = purchasesResult.rows as PurchaseOrder[];
  const receipts = receiptsResult.rows as Receipt[];
  const expenses = expensesResult.rows as Expense[];
  const items = itemsResult.rows as Named[];
  const profiles = profilesResult.rows as Named[];
  const suppliers = suppliersResult.rows as Named[];
  const itemNames = new Map(items.map((item) => [String(item.id), item.name]));
  const profileNames = new Map(profiles.map((profile) => [String(profile.id), profile.name]));
  const supplierNames = new Map(suppliers.map((supplier) => [String(supplier.id), supplier.name]));

  const salesRevenue = sales.reduce((sum, sale) => sum + valueOf(sale.total), 0);
  const deliveredRevenue = deliveredOrders.reduce((sum, order) => sum + valueOf(order.total), 0);
  const totalRevenue = salesRevenue + deliveredRevenue;
  const invoiceCount = sales.length + deliveredOrders.length;
  const discountTotal = sales.reduce((sum, sale) => sum + valueOf(sale.discount), 0);
  const cashTotal = sales.reduce((sum, sale) => sum + valueOf(sale.paid_cash) - valueOf(sale.change), 0)
    + deliveredOrders.filter((order) => order.pay_method === "cash").reduce((sum, order) => sum + valueOf(order.total), 0);
  const cardTotal = sales.reduce((sum, sale) => sum + valueOf(sale.paid_card), 0)
    + deliveredOrders.filter((order) => order.pay_method !== "cash").reduce((sum, order) => sum + valueOf(order.total), 0);
  const approvedExpenses = expenses.filter((expense) => expense.status === "ok");
  const expenseTotal = approvedExpenses.reduce((sum, expense) => sum + valueOf(expense.amount), 0);
  const receiptTotal = receipts.reduce((sum, receipt) =>
    sum + (receipt.receipt_lines ?? []).reduce((lineSum, line) => lineSum + valueOf(line.accepted) * valueOf(line.price), 0), 0);
  const movedQuantity = moves.reduce((sum, move) => sum + Math.abs(valueOf(move.qty)), 0);
  const productionOutput = production.reduce((sum, order) =>
    sum + (order.prod_steps ?? []).reduce((stepSum, step) => stepSum + valueOf(step.out_weight), 0), 0);
  const productionWaste = production.reduce((sum, order) =>
    sum + (order.prod_steps ?? []).reduce((stepSum, step) => stepSum + valueOf(step.waste), 0), 0);

  const salesByLocation = aggregate(
    [
      ...sales.map((row) => ({ location: row.location_id, amount: valueOf(row.total), count: 1 })),
      ...deliveredOrders.map((row) => ({ location: row.location_id, amount: valueOf(row.total), count: 1 })),
    ],
    (row) => row.location,
    (row) => row.amount,
  );
  const salesCountByLocation = aggregate(
    [
      ...sales.map((row) => ({ location: row.location_id, count: 1 })),
      ...deliveredOrders.map((row) => ({ location: row.location_id, count: 1 })),
    ],
    (row) => row.location,
    (row) => row.count,
  );
  const locationRows: StatRow[] = [...salesByLocation.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, amount]) => ({
      label: locationNames.get(id) ?? id,
      count: salesCountByLocation.get(id) ?? 0,
      value: `${money(amount)} ج`,
    }));

  const products = new Map<string, { quantity: number; amount: number }>();
  for (const line of sales.flatMap((sale) => sale.sale_lines ?? [])) {
    const key = String(line.item_id);
    const current = products.get(key) ?? { quantity: 0, amount: 0 };
    current.quantity += valueOf(line.qty);
    current.amount += valueOf(line.total);
    products.set(key, current);
  }
  for (const order of deliveredOrders) {
    for (const line of order.online_order_lines ?? []) {
      const key = String(line.item_id);
      const current = products.get(key) ?? { quantity: 0, amount: 0 };
      current.quantity += valueOf(line.prepared);
      current.amount += valueOf(line.prepared) * valueOf(line.unit_price);
      products.set(key, current);
    }
  }
  const productRows: StatRow[] = [...products.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 10)
    .map(([id, row]) => ({
      label: itemNames.get(id) ?? `صنف ${id}`,
      count: row.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 }),
      value: `${money(row.amount)} ج`,
    }));

  const cashierStats = aggregate(sales, (sale) => sale.cashier, (sale) => valueOf(sale.total));
  const cashierCounts = aggregate(sales, (sale) => sale.cashier, () => 1);
  const cashierRows: StatRow[] = [...cashierStats.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, amount]) => ({
      label: profileNames.get(id) ?? "كاشير غير معروف",
      count: cashierCounts.get(id) ?? 0,
      value: `${money(amount)} ج`,
    }));

  const orderStatuses = aggregate(orders, (order) => order.status, () => 1);
  const boxStatuses = aggregate(boxes, (box) => box.status, () => 1);
  const productionStatuses = aggregate(production, (order) => order.status, () => 1);
  const transferStatuses = aggregate(transfers, (transfer) => transfer.status, () => 1);
  const purchaseStatuses = aggregate(purchases, (purchase) => purchase.status, () => 1);
  const expenseStatuses = aggregate(expenses, (expense) => expense.status, () => 1);
  const tripStatuses = aggregate(trips, (trip) => trip.status, () => 1);

  let statusTitle = "توزيع الحالات";
  let rawStatus = new Map<string, number>();
  if (scope === "orders" || (scope === "all" && access.orders)) {
    statusTitle = "حالة طلبات الأونلاين";
    rawStatus = orderStatuses;
  } else if (scope === "inventory") {
    statusTitle = "حالة العلب المغلفة";
    rawStatus = boxStatuses;
  } else if (scope === "production" || (scope === "all" && access.production)) {
    statusTitle = "حالة أوامر الإنتاج";
    rawStatus = productionStatuses;
  } else if (scope === "logistics") {
    statusTitle = "حالة التحويلات والرحلات";
    rawStatus = new Map([...transferStatuses, ...tripStatuses]);
  } else if (scope === "purchases" || (scope === "all" && access.purchases)) {
    statusTitle = "حالة أوامر التوريد";
    rawStatus = purchaseStatuses;
  } else if (scope === "finance") {
    statusTitle = "حالة المصروفات";
    rawStatus = expenseStatuses;
  } else if (scope === "sales" && (cashTotal || cardTotal)) {
    statusTitle = "وسائل التحصيل";
    rawStatus = new Map([["نقدي", cashTotal], ["بطاقة / إلكتروني", cardTotal]]);
  }
  const statusRows = [...rawStatus.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count], index) => ({
      key,
      label: statusLabels[key] ?? key,
      count,
      color: statusColors[index % statusColors.length],
    }));
  const statusTotal = statusRows.reduce((sum, row) => sum + row.count, 0);
  const finishedTotal = statusRows
    .filter((row) => ["done", "delivered", "received", "ok", "نقدي", "بطاقة / إلكتروني"].includes(row.key))
    .reduce((sum, row) => sum + row.count, 0);
  const statusPercent = statusTotal ? Math.round((finishedTotal / statusTotal) * 100) : 0;
  const circumference = 264;

  const expenseCategories = aggregate(
    expenses,
    (expense) => relationName(expense.expense_categories),
    (expense) => valueOf(expense.amount),
  );
  const expenseCategoryCounts = aggregate(
    expenses,
    (expense) => relationName(expense.expense_categories),
    () => 1,
  );
  const expenseRows: StatRow[] = [...expenseCategories.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, amount]) => ({ label, count: expenseCategoryCounts.get(label) ?? 0, value: `${money(amount)} ج` }));

  const stockKinds = aggregate(moves, (move) => move.kind, (move) => Math.abs(valueOf(move.qty)));
  const stockKindCounts = aggregate(moves, (move) => move.kind, () => 1);
  const stockRows: StatRow[] = [...stockKinds.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, quantity]) => ({
      label: kindLabels[kind] ?? kind,
      count: stockKindCounts.get(kind) ?? 0,
      value: quantity.toLocaleString("en-US", { maximumFractionDigits: 2 }),
    }));

  const purchaseBySupplier = new Map<string, { count: number; amount: number }>();
  for (const receipt of receipts) {
    const key = String(receipt.supplier_id);
    const row = purchaseBySupplier.get(key) ?? { count: 0, amount: 0 };
    row.count++;
    row.amount += (receipt.receipt_lines ?? []).reduce((sum, line) => sum + valueOf(line.accepted) * valueOf(line.price), 0);
    purchaseBySupplier.set(key, row);
  }
  const supplierRows: StatRow[] = [...purchaseBySupplier.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 10)
    .map(([id, row]) => ({
      label: supplierNames.get(id) ?? `مورد ${id}`,
      count: row.count,
      value: `${money(row.amount)} ج`,
    }));

  const expenseLocationStats = aggregate(approvedExpenses, (expense) => expense.location_id, (expense) => valueOf(expense.amount));
  const expenseLocationRows: StatRow[] = [...expenseLocationStats.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, amount]) => ({
      label: locationNames.get(id) ?? id,
      count: approvedExpenses.filter((expense) => expense.location_id === id).length,
      value: `${money(amount)} ج`,
    }));

  let chartTitle = "قيمة المبيعات";
  let chartUnit = "جنيه";
  let chartEntries: { at: string; value: number }[] = [];
  if (scope === "all" || scope === "sales" || scope === "finance") {
    chartEntries = [
      ...sales.map((sale) => ({ at: sale.at, value: valueOf(sale.total) })),
      ...deliveredOrders.filter((order) => order.delivered_at)
        .map((order) => ({ at: order.delivered_at!, value: valueOf(order.total) })),
    ];
    if (scope === "finance") {
      chartTitle = "قيمة المصروفات";
      chartEntries = expenses.map((expense) => ({ at: expense.day, value: valueOf(expense.amount) }));
    }
  } else if (scope === "orders") {
    chartTitle = "الطلبات الجديدة خلال الفترة";
    chartUnit = "طلب";
    chartEntries = orders.map((order) => ({ at: order.created_at, value: 1 }));
  } else if (scope === "inventory") {
    chartTitle = status ? "العلب حسب يوم التغليف" : "حركة المخزون";
    chartUnit = status ? "علبة" : "وحدة حركة";
    chartEntries = status
      ? boxes.map((box) => ({ at: box.packed_at, value: 1 }))
      : moves.map((move) => ({ at: move.at, value: Math.abs(valueOf(move.qty)) }));
  } else if (scope === "production") {
    chartTitle = "كميات أوامر الإنتاج";
    chartUnit = "كمية";
    chartEntries = production.map((order) => ({ at: order.created_at, value: valueOf(order.qty) }));
  } else if (scope === "logistics") {
    const tripStatusFilter = ["loading", "out", "done"].includes(status);
    chartTitle = tripStatusFilter ? "الرحلات حسب الحالة" : "التحويلات حسب الحالة";
    chartUnit = "عملية";
    chartEntries = tripStatusFilter
      ? trips.map((trip) => ({ at: trip.created_at, value: 1 }))
      : transfers.map((transfer) => ({ at: transfer.sent_at, value: 1 }));
  } else if (scope === "purchases") {
    chartTitle = status ? "أوامر التوريد حسب تاريخ الإنشاء" : "قيمة الاستلامات";
    chartUnit = status ? "أمر توريد" : "جنيه";
    chartEntries = status
      ? purchases.map((purchase) => ({ at: purchase.created_at, value: 1 }))
      : receipts.map((receipt) => ({
          at: receipt.at,
          value: (receipt.receipt_lines ?? []).reduce((sum, line) => sum + valueOf(line.accepted) * valueOf(line.price), 0),
        }));
  }
  const chartData = makeChart(chartEntries, from, to, grouping);
  const chartMax = Math.max(1, ...chartData.map((point) => point.value));
  const chartPoints = chartData.map((point, index) => {
    const x = chartData.length < 2 ? 500 : 52 + (index / (chartData.length - 1)) * 828;
    const y = 205 - (point.value / chartMax) * 155;
    return { ...point, x, y };
  });
  const linePath = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = chartPoints.length
    ? `M ${chartPoints[0].x},205 L ${chartPoints.map((point) => `${point.x},${point.y}`).join(" L ")} L ${chartPoints[chartPoints.length - 1].x},205 Z`
    : "";
  const tickStep = Math.max(1, Math.ceil(chartPoints.length / 8));
  const chartTicks = chartPoints.filter((_, index) => index % tickStep === 0 || index === chartPoints.length - 1);

  const metrics: { label: string; value: string; foot: string; icon: IconType; color: string }[] = [];
  const metric = (label: string, value: string, foot: string, icon: IconType, color: string) =>
    metrics.push({ label, value, foot, icon, color });
  if (scope === "all") {
    if (includeSales) {
      metric("مبيعات محصلة", `${money(totalRevenue)} ج`, `${invoiceCount} فاتورة / طلب تم تسليمه`, PiShoppingCartFill, "#1677e8");
      metric("متوسط التحصيل", `${money(invoiceCount ? totalRevenue / invoiceCount : 0)} ج`, `${money(discountTotal)} ج خصومات فواتير الكاشير`, PiReceiptFill, "#16a777");
    }
    if (includeOrders) metric("طلبات أونلاين", `${orders.length}`, `${orders.filter((row) => !["delivered", "cancelled"].includes(row.status)).length} طلب مفتوح`, PiShoppingBagOpenFill, "#fb8c2a");
    if (includeFinance) metric("مصروفات معتمدة", `${money(expenseTotal)} ج`, `${expenses.length} حركة مصروف`, PiMoneyFill, "#8854d0");
    if (includePurchases) metric("قيمة الاستلامات", `${money(receiptTotal)} ج`, `${receipts.length} إذن استلام`, PiReceiptFill, "#16a6a0");
    if (includeInventory) metric("حركة مخزون", `${money(movedQuantity)}`, `${moves.length} حركة · ${boxes.length} علبة مغلفة`, PiPackageFill, "#e56d35");
    if (includeProduction) metric("أوامر إنتاج", `${production.length}`, `${money(productionOutput)} كمية منتجة`, PiFactoryFill, "#7554c7");
    if (includeLogistics) metric("تحويلات ورحلات", `${transfers.length + trips.length}`, `${transfers.filter((row) => row.status === "transit").length} تحويل في الطريق`, PiTruckFill, "#e14b80");
  } else if (scope === "sales") {
    metric("إجمالي المبيعات", `${money(totalRevenue)} ج`, `${invoiceCount} فاتورة / طلب تم تسليمه`, PiShoppingCartFill, "#1677e8");
    metric("متوسط الفاتورة", `${money(invoiceCount ? totalRevenue / invoiceCount : 0)} ج`, "متوسط قيمة العمليات المكتملة", PiReceiptFill, "#16a777");
    metric("نقدي", `${money(cashTotal)} ج`, "صافي الكاش بعد خصم الباقي", PiMoneyFill, "#fb8c2a");
    metric("بطاقة / إلكتروني", `${money(cardTotal)} ج`, `${money(discountTotal)} ج خصومات`, PiChartBarFill, "#8854d0");
  } else if (scope === "orders") {
    metric("إجمالي الطلبات", `${orders.length}`, "تاريخ الإنشاء داخل الفترة", PiShoppingBagOpenFill, "#1677e8");
    metric("تم التوصيل", `${orders.filter((row) => row.status === "delivered").length}`, `${money(orders.filter((row) => row.status === "delivered").reduce((sum, row) => sum + valueOf(row.total), 0))} ج قيمة الطلبات`, PiReceiptFill, "#16a777");
    metric("طلبات مفتوحة", `${orders.filter((row) => !["delivered", "cancelled"].includes(row.status)).length}`, "تحتاج متابعة أو تجهيز", PiTruckFill, "#fb8c2a");
    metric("طلبات ملغاة", `${orders.filter((row) => row.status === "cancelled").length}`, "داخل الفترة المحددة", PiChartBarFill, "#e14b80");
  } else if (scope === "inventory") {
    metric("حركة المخزون", `${money(movedQuantity)}`, `${moves.length} حركة مسجلة`, PiArrowsLeftRightFill, "#1677e8");
    metric("علب مغلفة", `${boxes.length}`, "في الفترة المحددة", PiPackageFill, "#16a777");
    metric("أصناف بمخزون موجب", `${new Set(balances.map((row) => row.item_id)).size}`, `${money(balances.reduce((sum, row) => sum + valueOf(row.qty), 0))} إجمالي الرصيد`, PiChartBarFill, "#fb8c2a");
    metric("هالك / تبرعات", `${moves.filter((row) => ["waste", "donate"].includes(row.kind)).length}`, "حركة خروج مسجلة", PiReceiptFill, "#e14b80");
  } else if (scope === "production") {
    metric("أوامر الإنتاج", `${production.length}`, "تم إنشاؤها في الفترة", PiFactoryFill, "#1677e8");
    metric("أوامر مكتملة", `${production.filter((row) => row.status === "done").length}`, "تم إنهاؤها", PiReceiptFill, "#16a777");
    metric("إنتاج فعلي", `${productionOutput.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, "إجمالي الأوزان الخارجة", PiPackageFill, "#fb8c2a");
    metric("هالك إنتاج", `${productionWaste.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, "مسجل في خطوات الإنتاج", PiChartBarFill, "#e14b80");
  } else if (scope === "logistics") {
    metric("التحويلات", `${transfers.length}`, "مرسلة في الفترة", PiArrowsLeftRightFill, "#1677e8");
    metric("في الطريق", `${transfers.filter((row) => row.status === "transit").length}`, "تنتظر الاستلام", PiTruckFill, "#fb8c2a");
    metric("الرحلات", `${trips.length}`, "تم إنشاؤها في الفترة", PiTruckFill, "#8854d0");
    metric("رحلات خرجت", `${trips.filter((row) => row.status === "out").length}`, "في مسار التوزيع", PiReceiptFill, "#16a777");
  } else if (scope === "purchases") {
    metric("أوامر التوريد", `${purchases.length}`, "تم إنشاؤها في الفترة", PiShoppingBagOpenFill, "#1677e8");
    metric("أوامر مفتوحة", `${purchases.filter((row) => ["open", "partial"].includes(row.status)).length}`, "بانتظار اكتمال الاستلام", PiReceiptFill, "#fb8c2a");
    metric("أذون الاستلام", `${receipts.length}`, "داخل الفترة", PiPackageFill, "#16a777");
    metric("قيمة الاستلام", `${money(receiptTotal)} ج`, "الكمية المقبولة × السعر", PiMoneyFill, "#8854d0");
  } else {
    metric("المبيعات", `${money(totalRevenue)} ج`, `${invoiceCount} فاتورة / طلب تم تسليمه`, PiShoppingCartFill, "#1677e8");
    metric("المصروفات المعتمدة", `${money(expenseTotal)} ج`, `${approvedExpenses.length} مصروف معتمد`, PiMoneyFill, "#e14b80");
    metric("مشتريات مستلمة", `${money(receiptTotal)} ج`, `${receipts.length} إذن استلام`, PiShoppingBagOpenFill, "#fb8c2a");
    metric("صافي حركة الفترة", `${money(totalRevenue - expenseTotal - receiptTotal)} ج`, "مبيعات − مصروفات − استلامات، وليس صافي ربح", PiChartBarFill, "#16a777");
  }

  const exportRows: ExportRow[] = [
    ...chartData.map((point) => ({ section: chartTitle, label: point.label, count: "", value: point.value })),
    ...locationRows.map((row) => ({ section: "المبيعات حسب الموقع", label: row.label, count: row.count, value: row.value })),
    ...productRows.map((row) => ({ section: "الأصناف الأعلى مبيعاً", label: row.label, count: row.count, value: row.value })),
    ...statusRows.map((row) => ({ section: statusTitle, label: row.label, count: row.count, value: "" })),
    ...expenseRows.map((row) => ({ section: "المصروفات حسب التصنيف", label: row.label, count: row.count, value: row.value })),
    ...supplierRows.map((row) => ({ section: "الاستلامات حسب المورد", label: row.label, count: row.count, value: row.value })),
  ];

  const fromLabel = formatDay(from);
  const toLabel = formatDay(to);
  const selectedLocationName = location ? locationNames.get(location) : "كل المواقع";
  const currentReportLabel = scopes.find((option) => option.id === scope)?.label ?? "كامل النظام";
  const makePresetHref = (startDay: string, endDay: string) => {
    const query = new URLSearchParams({ from: startDay, to: endDay, report: scope, group: grouping });
    if (location) query.set("loc", location);
    return `/statistics?${query.toString()}`;
  };
  const presetRanges = [
    { label: "اليوم", from: today, to: today },
    { label: "آخر 7 أيام", from: shiftDate(today, -6), to: today },
    { label: "آخر 30 يوم", from: shiftDate(today, -29), to: today },
    { label: "12 شهر", from: defaultFrom, to: today },
  ];
  const hasDataError = failed || !!locationError;
  const warning = rangeWarning || (hasDataError ? "تعذر تحميل بعض البيانات. راجع صلاحيات الحساب أو حاول تحديث التقرير." : "")
    || (truncated ? "وصل التقرير إلى الحد الأقصى للقراءة. قلل الفترة للحصول على كل النتائج." : "");
  const systemOverview = [
    { label: "المواقع النشطة", value: locations.filter((row) => row.active).length },
    { label: "المستخدمون النشطون", value: profiles.filter((row) => row.active).length },
    { label: "الأصناف النشطة", value: items.filter((row) => row.active).length },
    { label: "رصيد المخزون الحالي", value: balances.reduce((sum, row) => sum + valueOf(row.qty), 0).toLocaleString("en-US", { maximumFractionDigits: 2 }) },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>تقارير وإحصائيات النظام</h1>
          <p>{currentReportLabel} · {fromLabel} - {toLabel} · {selectedLocationName}</p>
        </div>
        <div className={styles.headingActions}><ReportExport rows={exportRows} /></div>
      </header>

      <nav className={styles.presets} aria-label="فترات سريعة">
        <span className="muted">فترة سريعة:</span>
        {presetRanges.map((range) => (
          <Link
            key={range.label}
            className={`${styles.preset}${from === range.from && to === range.to ? ` ${styles.presetActive}` : ""}`}
            href={makePresetHref(range.from, range.to)}
          >
            {range.label}
          </Link>
        ))}
      </nav>

      <form className={styles.filters} method="get" action="/statistics">
        <label className={styles.field}>من تاريخ<input type="date" name="from" defaultValue={from} /></label>
        <label className={styles.field}>إلى تاريخ<input type="date" name="to" defaultValue={to} /></label>
        <label className={styles.field}>
          التقرير
          <select name="report" defaultValue={scope}>
            {availableScopes.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          الموقع / الفرع
          <select name="loc" defaultValue={location}>
            <option value="">كل المواقع</option>
            {locations.map((row) => (
              <option key={row.id} value={row.id}>{row.name}{row.active ? "" : " (متوقف)"}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {scopeStatusLabel(scope)}
          <select name="status" defaultValue={status} disabled={!scopeStatusOptions(scope).length}>
            <option value="">كل الحالات</option>
            {scopeStatusOptions(scope).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          تجميع الرسم
          <select name="group" defaultValue={grouping}>
            <option value="month">شهري</option><option value="day">يومي</option>
          </select>
        </label>
        <button className={styles.filterButton} type="submit">تطبيق الفلاتر</button>
        <Link className={styles.resetButton} href="/statistics">إعادة ضبط</Link>
      </form>

      {warning && <div className={styles.notice} role="status">{warning}</div>}
      {includePurchases && location && (
        <div className={styles.notice} role="note">
          أوامر التوريد لا ترتبط بموقع في بيانات النظام؛ اختيار الموقع لا يقيّد أوامرها، وأذون الاستلام تظهر فقط عند اختيار مخزن main.
        </div>
      )}

      <section className={styles.metrics} aria-label="ملخص المؤشرات">
        {metrics.map((item) => {
          const MetricIcon = item.icon;
          return (
            <article key={item.label} className={styles.metric} style={{ "--metric-color": item.color } as React.CSSProperties}>
              <span className={styles.metricIcon}><MetricIcon aria-hidden /></span>
              <span className={styles.metricText}>
                <span className={styles.metricLabel}>{item.label}</span>
                <strong className={`${styles.metricValue} num`}>{item.value}</strong>
                <small className={styles.metricFoot}>{item.foot}</small>
              </span>
            </article>
          );
        })}
      </section>

      <section className={styles.primaryGrid}>
        <article className={styles.panel}>
          <h2 className={styles.panelTitle}>{chartTitle}<small>{grouping === "month" ? "تجميع شهري" : "تجميع يومي"} · {chartUnit}</small></h2>
          {!chartEntries.length ? <div className={styles.emptyChart}>لا توجد حركة في الفترة المختارة</div> : (
            <div className={styles.chartWrap}>
              <svg className={styles.chart} viewBox="0 0 900 235" role="img" aria-label={chartTitle}>
                <defs>
                  <linearGradient id="sales-area" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#1677e8" stopOpacity=".28" />
                    <stop offset="100%" stopColor="#1677e8" stopOpacity=".02" />
                  </linearGradient>
                </defs>
                {[50, 101, 153, 205].map((y, index) => (
                  <g key={y}>
                    <line className={styles.gridLine} x1="48" x2="880" y1={y} y2={y} />
                    <text className={styles.axisLabel} x="40" y={y + 4} textAnchor="end">
                      {Math.round((chartMax * (3 - index)) / 3).toLocaleString("en-US")}
                    </text>
                  </g>
                ))}
                {areaPath && <path className={styles.chartArea} d={areaPath} />}
                {linePath && <polyline className={styles.chartLine} points={linePath} />}
                {chartPoints.map((point) => (
                  <circle key={point.key} className={styles.chartPoint} cx={point.x} cy={point.y} r="3.5">
                    <title>{point.label}: {point.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</title>
                  </circle>
                ))}
              </svg>
              <div className={styles.chartLabels}>
                {chartTicks.map((point) => <span key={point.key} title={point.label}>{point.label}</span>)}
              </div>
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <h2 className={styles.panelTitle}>{statusTitle}<small>{statusTotal} سجل</small></h2>
          <div className={styles.statusContent}>
            <svg className={styles.donut} viewBox="0 0 100 100" role="img" aria-label={`${statusPercent}% مكتمل`}>
              <circle className={styles.donutTrack} cx="50" cy="50" r="42" />
              <circle
                className={styles.donutValue}
                cx="50" cy="50" r="42"
                strokeDasharray={`${(circumference * statusPercent) / 100} ${circumference}`}
              />
              <text className={styles.donutNumber} x="50" y="49">{statusPercent}%</text>
              <text className={styles.donutCaption} x="50" y="63">مكتمل</text>
            </svg>
            <div className={styles.legend}>
              {!statusRows.length ? <span className="muted">لا توجد سجلات</span> : statusRows.slice(0, 6).map((row) => (
                <div className={styles.legendRow} key={row.key}>
                  <i className={styles.legendDot} style={{ background: row.color }} />
                  <span className={styles.legendName}>{row.label}</span>
                  <strong className={styles.legendValue}>{row.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      {includeOverview && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>حالة النظام الحالية<small>أرصدة وبيانات حالية، وليست مقيدة بالفترة</small></h2>
          <div className={styles.overview}>
            {systemOverview.map((item) => (
              <div className={styles.overviewItem} key={item.label}>
                <span>{item.label}</span><strong className="num">{item.value}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.detailsGrid}>
        {includeSales && (
          <>
            <SummaryPanel title="المبيعات حسب الموقع" rows={locationRows} countHeading="فواتير / طلبات" valueHeading="المبيعات" empty="لا توجد مبيعات في الفترة." />
            <SummaryPanel title="الأصناف الأعلى مبيعاً" rows={productRows} countHeading="كمية مباعة" valueHeading="قيمة البيع" empty="لا توجد تفاصيل أصناف للفترة." />
            <SummaryPanel title="المبيعات حسب الكاشير" rows={cashierRows} countHeading="فواتير" valueHeading="الإجمالي" empty="لا توجد فواتير كاشير للفترة." />
          </>
        )}
        {includeOrders && scope !== "sales" && (
          <SummaryPanel
            title="الطلبات حسب الحالة"
            rows={[...orderStatuses.entries()].map(([key, count]) => ({
              label: statusLabels[key] ?? key,
              count,
              value: `${money(orders.filter((order) => order.status === key).reduce((sum, order) => sum + valueOf(order.total ?? order.est_total), 0))} ج`,
            }))}
            countHeading="عدد الطلبات" valueHeading="القيمة" empty="لا توجد طلبات في الفترة."
          />
        )}
        {includeInventory && (
          <>
            <SummaryPanel title="حركة المخزون حسب النوع" rows={stockRows} countHeading="عدد الحركات" valueHeading="كمية الحركة" empty="لا توجد حركات مخزون في الفترة." />
            <SummaryPanel
              title="أعلى الأصناف حركة"
              rows={[...aggregate(moves, (move) => itemNames.get(String(move.item_id)) ?? relationName(move.items) ?? `صنف ${move.item_id}`, (move) => Math.abs(valueOf(move.qty))).entries()]
                .sort((a, b) => b[1] - a[1]).slice(0, 10)
                .map(([label, quantity]) => ({ label, count: moves.filter((move) => (itemNames.get(String(move.item_id)) ?? relationName(move.items)) === label).length, value: quantity.toLocaleString("en-US", { maximumFractionDigits: 2 }) }))}
              countHeading="عدد الحركات" valueHeading="كمية الحركة" empty="لا توجد حركات مخزون في الفترة."
            />
          </>
        )}
        {includeProduction && (
          <SummaryPanel
            title="الإنتاج والهالك حسب الحالة"
            rows={[...productionStatuses.entries()].map(([key, count]) => ({
              label: statusLabels[key] ?? key,
              count,
              value: `${production.filter((row) => row.status === key).reduce((sum, row) => sum + valueOf(row.qty), 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} كمية`,
            }))}
            countHeading="أوامر" valueHeading="الكمية المطلوبة" empty="لا توجد أوامر إنتاج في الفترة."
          />
        )}
        {includeLogistics && (
          <>
            <SummaryPanel
              title="التحويلات حسب الحالة"
              rows={[...transferStatuses.entries()].map(([key, count]) => ({
                label: statusLabels[key] ?? key,
                count,
                value: `${transfers.filter((row) => row.status === key).length} تحويل`,
              }))}
              countHeading="تحويلات" valueHeading="الحالة" empty="لا توجد تحويلات في الفترة."
            />
            <SummaryPanel
              title="الرحلات حسب الحالة"
              rows={[...tripStatuses.entries()].map(([key, count]) => ({ label: statusLabels[key] ?? key, count, value: `${count} رحلة` }))}
              countHeading="رحلات" valueHeading="العدد" empty="لا توجد رحلات في الفترة."
            />
          </>
        )}
        {includePurchases && (
          <SummaryPanel title="الاستلامات حسب المورد" rows={supplierRows} countHeading="أذون استلام" valueHeading="قيمة المقبول" empty="لا توجد استلامات في الفترة." />
        )}
        {includeFinance && (
          <>
            <SummaryPanel title="المصروفات حسب التصنيف" rows={expenseRows} countHeading="عدد المصروفات" valueHeading="القيمة" empty="لا توجد مصروفات في الفترة." />
            <SummaryPanel title="المصروفات حسب الموقع" rows={expenseLocationRows} countHeading="مصروفات معتمدة" valueHeading="القيمة" empty="لا توجد مصروفات معتمدة." />
          </>
        )}
      </section>

      <p className={styles.tableFoot}>
        الأرقام المالية بالجنيه. تقارير المخزون تعرض إجمالي كميات الحركة، وقد تظهر حركة التحويل مرتين لأنها تسجل خروجاً من موقع ودخولاً إلى آخر.
      </p>
    </div>
  );
}
