import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { sb } from "@/lib/supabase";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavBar } from "@/lib/nav";
import { useApp } from "@/lib/store";
import { BlackHead, Grid, T } from "@/lib/ui";
import { C } from "@/lib/theme";

export default function Offers() {
  const ins = useSafeAreaInsets();
  const { menu, config, district } = useApp();
  // مهرجانات التخفيضات الشغالة: أصنافها بسعر قبل/بعد لفرع العميل
  const [camps, setCamps] = useState<{ id: number; name: string; subtitle: string | null; color: string; ends_at: string; items: { item_id: number; price: number; old: number | null }[] }[]>([]);
  useEffect(() => { if (district?.id) sb.rpc("app_campaigns", { p_district: district.id }).then(({ data }) => setCamps((data ?? []) as typeof camps)); }, [district?.id]);
  const inCamp = new Set(camps.flatMap((c) => c.items.map((i) => i.item_id)));
  const L = (menu ?? []).filter((m) => m.pct > 0 && !inCamp.has(m.item_id));
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title="العروض" sub={camps.length ? camps.map((c) => c.name).join(" · ") : `${L.length} منتج عليه خصم`} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 + ins.bottom, gap: 14 }}>
        {config?.first_free && (
          <View style={{ backgroundColor: C.black, borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 30 }}>⚡</Text>
            <View style={{ flex: 1 }}><T w="x" style={{ color: C.y }}>توصيل مجاني على أول طلب</T><T style={{ color: "#999", fontSize: 12 }}>بيتحسب لوحده في السلة</T></View>
          </View>
        )}
        <View style={{ backgroundColor: C.y, borderRadius: 18, padding: 16, gap: 2 }}>
          <T w="x">🎟️ كود RASLAN10</T>
          <T style={{ fontSize: 12.5 }}>خصم 10% على الطلب فوق 200 ج (لحد 50 ج) — اكتبه في السلة</T>
        </View>
        {camps.map((c) => {
          const items = c.items.map((ci) => { const m = (menu ?? []).find((x) => x.item_id === ci.item_id); return m ? { ...m, old_price: ci.old ?? m.old_price, pct: ci.old ? Math.round((1 - ci.price / ci.old) * 100) : m.pct } : null; }).filter((x): x is NonNullable<typeof x> => !!x);
          if (!items.length) return null;
          return (
            <View key={c.id} style={{ gap: 10 }}>
              <View style={{ backgroundColor: c.color, borderRadius: 18, padding: 16, gap: 2 }}>
                <T w="x" style={{ color: "#fff", fontSize: 18 }}>{c.name}</T>
                {!!c.subtitle && <T style={{ color: "#fff" }}>{c.subtitle}</T>}
                <T style={{ color: "#fff", fontSize: 12, opacity: 0.9 }}>لحد {new Date(c.ends_at).toLocaleDateString("ar-EG", { day: "numeric", month: "long" })}</T>
              </View>
              <Grid items={items} />
            </View>
          );
        })}
        {L.length ? <Grid items={L} /> : !camps.length ? <T style={{ color: C.mid }}>مفيش عروض على أصناف دلوقتي</T> : null}
      </ScrollView>
      <NavBar />
    </View>
  );
}
