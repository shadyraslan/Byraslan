import { Redirect, Tabs } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/lib/store";
import { C, F } from "@/lib/theme";

const ITEMS: { name: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: "index", label: "الرئيسية", icon: "home" },
  { name: "cats", label: "الأقسام", icon: "grid" },
  { name: "cart", label: "", icon: "cart" },
  { name: "orders", label: "طلباتي", icon: "receipt" },
  { name: "account", label: "حسابي", icon: "person" },
];
type BarProps = { state: { index: number; routes: { name: string }[] }; navigation: { navigate: (name: never) => void } };

function Bar({ state, navigation }: BarProps) {
  const ins = useSafeAreaInsets();
  const { cart } = useApp();
  const n = Object.keys(cart).length;
  const cur = state.routes[state.index]?.name;
  return (
    <View style={{ position: "absolute", left: 14, right: 14, bottom: 10 + ins.bottom, backgroundColor: C.white, borderRadius: 24, flexDirection: "row", alignItems: "center", paddingVertical: 9, paddingHorizontal: 4, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 }}>
      {ITEMS.map((it) => {
        const on = cur === it.name;
        const go = () => navigation.navigate(it.name as never);
        if (it.name === "cart") return (
          <Pressable key={it.name} onPress={go} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.y, marginTop: -34, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: C.off, shadowColor: C.y, shadowOpacity: 0.5, shadowRadius: 10, elevation: 8 }}>
              <Ionicons name="cart" size={24} color={C.black} />
              <View style={{ position: "absolute", top: -4, left: -4, backgroundColor: C.black, borderRadius: 10, paddingHorizontal: 5, minWidth: 20, height: 20, justifyContent: "center" }}><Text style={{ color: C.white, fontSize: 10.5, fontFamily: F.b, textAlign: "center" }}>{n}</Text></View>
            </View>
          </Pressable>
        );
        return (
          <Pressable key={it.name} onPress={go} style={{ flex: 1, alignItems: "center", gap: 2 }}>
            <Ionicons name={on ? it.icon : (`${it.icon}-outline` as keyof typeof Ionicons.glyphMap)} size={21} color={on ? C.black : "#B0B0B0"} />
            <Text style={{ fontFamily: on ? F.x : F.b, fontSize: 10.5, color: on ? C.black : "#B0B0B0" }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { ready, seen } = useApp();
  if (!ready) return null;
  if (!seen) return <Redirect href="/welcome" />;
  return (
    <Tabs tabBar={(p) => <Bar state={p.state} navigation={p.navigation as unknown as BarProps["navigation"]} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.off } }}>
      {ITEMS.map((i) => <Tabs.Screen key={i.name} name={i.name} />)}
    </Tabs>
  );
}
