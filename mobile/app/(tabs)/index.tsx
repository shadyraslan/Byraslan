import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "@/lib/store";
import { Btn, Chip, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";
import type { MenuItem } from "@/lib/types";

type Row = { kind: "h"; title: string } | { kind: "i"; m: MenuItem };

export default function Shop() {
  const { config, branch, setBranch, menu, loadMenu, cart, add } = useApp();
  const [brand, setBrand] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const br = config?.branches.find((b) => b.id === branch);
  const brands = useMemo(() => [...new Set((menu ?? []).map((m) => m.brand))], [menu]);
  const cur = brand && brands.includes(brand) ? brand : brands[0] ?? null;
  const rows: Row[] = useMemo(() => {
    const L = (menu ?? []).filter((m) => m.brand === cur);
    const out: Row[] = [];
    let last = "";
    for (const m of L) { const f = m.family ?? "أصناف"; if (f !== last) { out.push({ kind: "h", title: f }); last = f; } out.push({ kind: "i", m }); }
    return out;
  }, [menu, cur]);
  const sub = (menu ?? []).reduce((a, m) => a + (cart[m.item_id] ?? 0) * m.price, 0);
  const count = Object.keys(cart).length;

  if (!branch || !br) return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <T w="x" style={{ fontSize: 22 }}>أهلًا بيك 👋</T>
      <T style={{ color: C.muted }}>اختار أقرب فرع ليك عشان نوريك المتاح عنده</T>
      {(config?.branches ?? []).map((b) => (
        <Pressable key={b.id} onPress={() => setBranch(b.id)} style={{ backgroundColor: C.panel, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16 }}>
          <T w="b" style={{ fontSize: 18 }}>{b.name}</T>
          <T style={{ color: C.muted }}>التوصيل {money(b.fee)} · أقل طلب {money(b.min_order)}</T>
        </Pressable>
      ))}
      {!config && <T style={{ color: C.muted }}>بيحمّل…</T>}
    </ScrollView>
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 12, gap: 10, backgroundColor: C.bg }}>
        <Pressable onPress={() => router.push("/account")} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T w="b">فرع {br.name}</T><T style={{ color: C.muted }}>التوصيل {money(br.fee)}</T>
        </Pressable>
        {!br.open && <T w="b" style={{ color: C.bad }}>الطلبات مقفولة دلوقتي</T>}
        {brands.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {brands.map((b) => <Chip key={b} label={config?.brands[b] ?? b} on={b === cur} onPress={() => setBrand(b)} />)}
          </ScrollView>
        )}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r, i) => (r.kind === "h" ? `h${i}` : `i${r.m.item_id}`)}
        contentContainerStyle={{ padding: 12, paddingBottom: 120, gap: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadMenu(); setRefreshing(false); }} />}
        ListEmptyComponent={<T style={{ color: C.muted, textAlign: "center", marginTop: 40 }}>{menu ? "مفيش أصناف متاحة في الفرع ده دلوقتي" : "بيحمّل…"}</T>}
        renderItem={({ item: r }) => r.kind === "h" ? <T w="x" style={{ fontSize: 18, marginTop: 8 }}>{r.title}</T> : <Item m={r.m} q={cart[r.m.item_id] ?? 0} add={add} />}
      />
      {count > 0 && (
        <View style={{ position: "absolute", bottom: 12, left: 12, right: 12 }}>
          <Btn kind="dark" title={`السلة · ${count} صنف · ${money(sub)}`} onPress={() => router.push("/cart")} />
        </View>
      )}
    </View>
  );
}

function Item({ m, q, add }: { m: MenuItem; q: number; add: (m: MenuItem, d: 1 | -1) => void }) {
  const out = m.available <= 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.panel, borderRadius: 16, borderWidth: 1, borderColor: q ? C.y : C.line, padding: 12, opacity: out ? 0.5 : 1 }}>
      <View style={{ flex: 1 }}>
        <T w="b" style={{ fontSize: 16 }}>{m.name}</T>
        <T style={{ color: C.muted }}>{money(m.price)} / {m.unit}{out ? " · خلص" : ""}</T>
      </View>
      {q ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Round t="−" onPress={() => add(m, -1)} />
          <T w="x" style={{ minWidth: 34, textAlign: "center" }}>{q}</T>
          <Round t="+" onPress={() => add(m, 1)} disabled={out} />
        </View>
      ) : <Btn title="أضف" onPress={() => add(m, 1)} disabled={out} style={{ height: 40 }} />}
    </View>
  );
}
const Round = ({ t, onPress, disabled }: { t: string; onPress: () => void; disabled?: boolean }) => (
  <Pressable onPress={onPress} disabled={disabled} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.y, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
    <T w="x" style={{ fontSize: 20, textAlign: "center" }}>{t}</T>
  </Pressable>
);
