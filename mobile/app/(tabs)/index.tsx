import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import { useApp } from "@/lib/store";
import { Btn, Chip, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";
import type { MenuItem } from "@/lib/types";

type Row = { kind: "h"; title: string } | { kind: "i"; m: MenuItem };

/* ───────── صفحة اختيار الفرع ───────── */
function BranchPicker() {
  const { config, setBranch } = useApp();
  return (
    <ScrollView contentContainerStyle={s.branchScroll} showsVerticalScrollIndicator={false}>
      {/* Hero */}
      <View style={s.hero}>
        <T w="x" style={s.heroTitle}>باي رسلان 🛒</T>
        <T style={s.heroSub}>اختار أقرب فرع ليك</T>
      </View>

      {/* Branches */}
      <View style={s.branchList}>
        {(config?.branches ?? []).map((b) => (
          <Pressable
            key={b.id}
            onPress={() => setBranch(b.id)}
            style={({ pressed }) => [s.branchCard, pressed && { opacity: 0.85 }]}
          >
            <View style={s.branchLeft}>
              <T w="b" style={s.branchName}>{b.name}</T>
              <T style={s.branchMeta}>
                توصيل {money(b.fee)} · أقل طلب {money(b.min_order)}
              </T>
            </View>
            <View style={s.branchArrow}>
              <T w="x" style={s.arrowTxt}>›</T>
            </View>
          </Pressable>
        ))}
        {!config && (
          <T style={{ color: C.muted, textAlign: "center", marginTop: 24 }}>
            بيحمّل…
          </T>
        )}
      </View>
    </ScrollView>
  );
}

/* ───────── الصفحة الرئيسية ───────── */
export default function Shop() {
  const { config, branch, setBranch, menu, loadMenu, cart, add } = useApp();
  const [brand, setBrand] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const br = config?.branches.find((b) => b.id === branch);
  const brands = useMemo(
    () => [...new Set((menu ?? []).map((m) => m.brand))],
    [menu]
  );
  const cur = brand && brands.includes(brand) ? brand : brands[0] ?? null;

  const rows: Row[] = useMemo(() => {
    const L = (menu ?? []).filter((m) => m.brand === cur);
    const out: Row[] = [];
    let last = "";
    for (const m of L) {
      const f = m.family ?? "أصناف";
      if (f !== last) { out.push({ kind: "h", title: f }); last = f; }
      out.push({ kind: "i", m });
    }
    return out;
  }, [menu, cur]);

  const sub = (menu ?? []).reduce(
    (a, m) => a + (cart[m.item_id] ?? 0) * m.price, 0
  );
  const count = Object.values(cart).reduce((a, v) => a + v, 0);

  if (!branch || !br) return <BranchPicker />;

  return (
    <View style={s.flex}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <Pressable onPress={() => setBranch(null)} style={s.branchBadge}>
          <T w="b" style={s.branchBadgeTxt}>📍 {br.name}</T>
          <T style={s.branchBadgeSub}>تغيير</T>
        </Pressable>
        <Pressable onPress={() => router.push("/account")} style={s.accountBtn}>
          <T style={s.accountBtnTxt}>👤</T>
        </Pressable>
      </View>

      {/* Closed banner */}
      {!br.open && (
        <View style={s.closedBanner}>
          <T w="b" style={s.closedTxt}>⛔ الطلبات مقفولة دلوقتي</T>
        </View>
      )}

      {/* Brand tabs */}
      {brands.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.tabsRow}
          contentContainerStyle={s.tabsContent}
        >
          {brands.map((b) => (
            <Chip
              key={b}
              label={config?.brands[b] ?? b}
              on={b === cur}
              onPress={() => setBrand(b)}
            />
          ))}
        </ScrollView>
      )}

      {/* Menu list */}
      <FlatList
        data={rows}
        keyExtractor={(r, i) =>
          r.kind === "h" ? `h${i}` : `i${r.m.item_id}`
        }
        contentContainerStyle={[
          s.listContent,
          count > 0 && { paddingBottom: 100 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadMenu();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <T style={s.empty}>
            {menu ? "مفيش أصناف متاحة دلوقتي" : "بيحمّل…"}
          </T>
        }
        renderItem={({ item: r }) =>
          r.kind === "h" ? (
            <T w="x" style={s.sectionHeader}>{r.title}</T>
          ) : (
            <Item m={r.m} q={cart[r.m.item_id] ?? 0} add={add} />
          )
        }
      />

      {/* Cart Fab */}
      {count > 0 && (
        <View style={s.cartFab}>
          <Pressable
            onPress={() => router.push("/cart")}
            style={({ pressed }) => [s.cartBtn, pressed && { opacity: 0.9 }]}
          >
            <View style={s.cartBadge}>
              <T w="x" style={s.cartBadgeTxt}>{count}</T>
            </View>
            <T w="b" style={s.cartBtnTxt}>عرض السلة</T>
            <T w="b" style={s.cartBtnPrice}>{money(sub)}</T>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/* ───────── Item Card ───────── */
function Item({
  m,
  q,
  add,
}: {
  m: MenuItem;
  q: number;
  add: (m: MenuItem, d: 1 | -1) => void;
}) {
  const out = m.available <= 0;
  return (
    <View style={[s.itemCard, q > 0 && s.itemCardActive, out && s.itemCardOut]}>
      <View style={s.itemInfo}>
        <T w="b" style={s.itemName}>{m.name}</T>
        <T style={s.itemPrice}>
          {money(m.price)} / {m.unit}
          {out ? " · خلص" : ""}
        </T>
      </View>

      {q > 0 ? (
        <View style={s.qtyRow}>
          <Round t="−" onPress={() => add(m, -1)} />
          <T w="x" style={s.qtyTxt}>{q}</T>
          <Round t="+" onPress={() => add(m, 1)} disabled={out} />
        </View>
      ) : (
        <Pressable
          onPress={() => !out && add(m, 1)}
          disabled={out}
          style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.75 }]}
        >
          <T w="x" style={s.addBtnTxt}>+</T>
        </Pressable>
      )}
    </View>
  );
}

const Round = ({
  t,
  onPress,
  disabled,
}: {
  t: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={[s.round, disabled && { opacity: 0.35 }]}
  >
    <T w="x" style={s.roundTxt}>{t}</T>
  </Pressable>
);

/* ───────── Styles ───────── */
const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },

  // Branch picker
  branchScroll: { padding: 24, gap: 20 },
  hero: { alignItems: "center", paddingVertical: 32, gap: 8 },
  heroTitle: { fontSize: 32, color: C.ink },
  heroSub: { fontSize: 16, color: C.muted },
  branchList: { gap: 12 },
  branchCard: {
    backgroundColor: C.panel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  branchLeft: { flex: 1, gap: 4 },
  branchName: { fontSize: 18 },
  branchMeta: { fontSize: 13, color: C.muted },
  branchArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.y,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowTxt: { fontSize: 22, color: C.ink },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  branchBadge: { gap: 2 },
  branchBadgeTxt: { fontSize: 15 },
  branchBadgeSub: { fontSize: 12, color: C.muted },
  accountBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  accountBtnTxt: { fontSize: 18 },

  // Closed
  closedBanner: {
    backgroundColor: "#FDECEC",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F5C6C6",
  },
  closedTxt: { color: C.bad, textAlign: "center" },

  // Tabs
  tabsRow: { maxHeight: 56, backgroundColor: C.bg },
  tabsContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },

  // List
  listContent: { padding: 12, paddingBottom: 24, gap: 8 },
  sectionHeader: { fontSize: 19, marginTop: 12, marginBottom: 4 },
  empty: { color: C.muted, textAlign: "center", marginTop: 60 },

  // Item card
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
  },
  itemCardActive: { borderColor: C.y, borderWidth: 2 },
  itemCardOut: { opacity: 0.45 },
  itemInfo: { flex: 1, gap: 4 },
  itemName: { fontSize: 16 },
  itemPrice: { fontSize: 13, color: C.muted },

  // Add button (circle)
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.y,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnTxt: { fontSize: 24, lineHeight: 28 },

  // Qty row
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyTxt: { fontSize: 18, minWidth: 28, textAlign: "center" },

  // Round btn
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.y,
    alignItems: "center",
    justifyContent: "center",
  },
  roundTxt: { fontSize: 20, lineHeight: 24 },

  // Cart FAB
  cartFab: {
    position: "absolute",
    bottom: 14,
    left: 14,
    right: 14,
  },
  cartBtn: {
    backgroundColor: C.black,
    borderRadius: 18,
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  cartBadge: {
    backgroundColor: C.y,
    borderRadius: 12,
    minWidth: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  cartBadgeTxt: { fontSize: 13, color: C.ink },
  cartBtnTxt: { flex: 1, color: "#fff", fontSize: 16 },
  cartBtnPrice: { color: C.y, fontSize: 16 },
});
