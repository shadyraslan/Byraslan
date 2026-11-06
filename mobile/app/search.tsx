import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/lib/store";
import { CartBar, Grid, Input, T, WTop } from "@/lib/ui";
import { C } from "@/lib/theme";

const norm = (s: string) => s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();

export default function Search() {
  const ins = useSafeAreaInsets();
  const { menu } = useApp();
  const [q, setQ] = useState("");
  const v = norm(q.trim());
  const L = v ? (menu ?? []).filter((m) => norm(`${m.name} ${m.family ?? ""}`).includes(v)) : [];
  return (
    <View style={{ flex: 1 }}>
      <WTop title="البحث" />
      <View style={{ padding: 14, paddingBottom: 0 }}><Input value={q} onChangeText={setQ} placeholder="دوّر على منتج…" autoFocus returnKeyType="search" /></View>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 90 + ins.bottom }} keyboardShouldPersistTaps="handled">
        {v && !L.length ? <T style={{ color: C.g, textAlign: "center", marginTop: 30 }}>مفيش نتايج لـ "{q}"</T> : <Grid items={L} />}
      </ScrollView>
      <CartBar bottom={14 + ins.bottom} />
    </View>
  );
}
