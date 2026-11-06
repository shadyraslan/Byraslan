import { Tabs } from "expo-router";
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

// البار اللي تحت زي تطبيق رسلان ماركت: أبيض عايم، والسلة دايرة صفرا في النص
type BarProps = { state: { index: number; routes: { name: string }[] }; navigation: { navigate: (name: never) => void } };
function Bar({ state, navigation }: BarProps) {
  const ins = useSafeAreaInsets();
  const { cart } = useApp();
  const n = Object.keys(cart).length;
  const cur = state.routes[state.index]?.name;
  return (
    <View style={{ position: "absolute", left: 12, right: 12, bottom: 12 + ins.bottom, backgroundColor: "#fff", borderRadius: 22, flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 4, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
      {ITEMS.map((it) => {
        const on = cur === it.name;
        const go = () => navigation.navigate(it.name as never);
        if (it.name === "cart") return (
          <Pressable key={it.name} onPress={go} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: C.y, marginTop: -30, alignItems: "center", justifyContent: "center", shadowColor: C.y, shadowOpacity: 0.5, shadowRadius: 8, elevation: 6 }}>
              <Ionicons name="cart" size={24} color={C.ink} />
              {n > 0 && <View style={{ position: "absolute", top: -2, left: -2, backgroundColor: C.ink, borderRadius: 9, paddingHorizontal: 5, minWidth: 18 }}><Text style={{ color: "#fff", fontSize: 10, fontFamily: F.b, textAlign: "center" }}>{n}</Text></View>}
            </View>
          </Pressable>
        );
        return (
          <Pressable key={it.name} onPress={go} style={{ flex: 1, alignItems: "center", gap: 2 }}>
            <Ionicons name={on ? it.icon : (`${it.icon}-outline` as keyof typeof Ionicons.glyphMap)} size={20} color={on ? C.ink : C.g} />
            <Text style={{ fontFamily: F.b, fontSize: 10.5, color: on ? C.ink : C.g }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <Bar state={p.state} navigation={p.navigation as unknown as BarProps["navigation"]} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="cats" />
      <Tabs.Screen name="cart" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
