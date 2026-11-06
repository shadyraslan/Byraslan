import { ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/lib/store";
import { CartBar, Grid, T, WTop } from "@/lib/ui";
import { C } from "@/lib/theme";

export default function Cat() {
  const { name, brand } = useLocalSearchParams<{ name: string; brand?: string }>();
  const ins = useSafeAreaInsets();
  const { menu } = useApp();
  const L = (menu ?? []).filter((m) => (m.family ?? "أصناف") === name && (!brand || m.brand === brand));
  return (
    <View style={{ flex: 1 }}>
      <WTop title={name ?? ""} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 90 + ins.bottom }}>
        <T style={{ color: C.g, marginBottom: 8 }}>{L.length} منتج</T>
        <Grid items={L} />
      </ScrollView>
      <CartBar bottom={14 + ins.bottom} />
    </View>
  );
}
