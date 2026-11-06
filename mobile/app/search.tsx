import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavBar } from "@/lib/nav";
import { useApp } from "@/lib/store";
import { BlackHead, Chip, Grid, Input, T } from "@/lib/ui";
import { C } from "@/lib/theme";

const norm = (s: string) => s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();

export default function Search() {
  const ins = useSafeAreaInsets();
  const { menu } = useApp();
  const [q, setQ] = useState("");
  const v = norm(q.trim());
  const L = v ? (menu ?? []).filter((m) => norm(`${m.name} ${m.family ?? ""}`).includes(v)) : [];
  const fams = [...new Set((menu ?? []).map((m) => m.family ?? "أصناف"))];
  const catHits = v ? fams.filter((f) => norm(f).includes(v)) : [];
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title="البحث">
        <Input dark value={q} onChangeText={setQ} placeholder="ابحث عن أي منتج..." autoFocus returnKeyType="search" style={{ minHeight: 44 }} />
      </BlackHead>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 + ins.bottom, gap: 14 }} keyboardShouldPersistTaps="handled">
        {!v && (
          <View style={{ gap: 10 }}>
            <T w="x">🔥 الأكثر بحثاً</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{fams.map((f) => <Chip key={f} label={f} on={false} onPress={() => setQ(f)} />)}</View>
          </View>
        )}
        {!!catHits.length && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {catHits.map((f) => <Chip key={f} label={`📂 ${f}`} on onPress={() => router.push({ pathname: "/cat/[name]", params: { name: f } })} />)}
          </View>
        )}
        {v && !L.length ? <T style={{ color: C.mid, textAlign: "center", marginTop: 30 }}>مفيش نتايج لـ "{q}"</T> : <Grid items={L} />}
      </ScrollView>
      <NavBar />
    </View>
  );
}
