import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavBar } from "@/lib/nav";
import { useApp } from "@/lib/store";
import { BlackHead, Chip, Grid, IconBtn, Input, T } from "@/lib/ui";
import { C } from "@/lib/theme";

const SORTS: [string, string][] = [["", "ترتيب"], ["low", "الأرخص"], ["high", "الأغلى"]];

export default function Cat() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const ins = useSafeAreaInsets();
  const { menu } = useApp();
  const [q, setQ] = useState("");
  const [onlyOffers, setOnlyOffers] = useState(false);
  const [sort, setSort] = useState(0);
  let L = (menu ?? []).filter((m) => (m.family ?? "أصناف") === name && (!q.trim() || m.name.includes(q.trim())) && (!onlyOffers || m.pct > 0));
  if (SORTS[sort][0] === "low") L = [...L].sort((a, b) => a.price - b.price);
  if (SORTS[sort][0] === "high") L = [...L].sort((a, b) => b.price - a.price);
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title={name} right={<IconBtn name="cart-outline" onPress={() => router.push("/cart")} />}>
        <Input dark value={q} onChangeText={setQ} placeholder={`ابحث في ${name}...`} style={{ minHeight: 42 }} />
      </BlackHead>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 18, paddingVertical: 12 }}>
        <Chip label={`⇅ ${SORTS[sort][1]}`} on={false} onPress={() => setSort((sort + 1) % SORTS.length)} />
        <Chip label="الكل" on={!onlyOffers} onPress={() => setOnlyOffers(false)} />
        <Chip label="عروض" yellow on={false} onPress={() => setOnlyOffers(true)} />
      </ScrollView>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 120 + ins.bottom }}>
        <T style={{ color: C.mid, marginBottom: 10, fontSize: 12.5 }}>{L.length} منتج</T>
        <Grid items={L} />
      </ScrollView>
      <NavBar />
    </View>
  );
}
