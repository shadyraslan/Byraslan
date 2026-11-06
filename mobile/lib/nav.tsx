import { Pressable, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "./store";
import { C, F } from "./theme";

const ITEMS: { href: "/" | "/cats" | "/cart" | "/orders" | "/account"; label: string; icon: keyof typeof Ionicons.glyphMap; match: (p: string) => boolean }[] = [
  { href: "/", label: "الرئيسية", icon: "home", match: (p) => p === "/" || p.startsWith("/offers") || p.startsWith("/search") },
  { href: "/cats", label: "الأقسام", icon: "grid", match: (p) => p.startsWith("/cats") || p.startsWith("/cat/") },
  { href: "/cart", label: "", icon: "cart", match: (p) => p.startsWith("/cart") },
  { href: "/orders", label: "طلباتي", icon: "receipt", match: (p) => p.startsWith("/orders") || p.startsWith("/detail") },
  { href: "/account", label: "حسابي", icon: "person", match: (p) => p.startsWith("/account") || p.startsWith("/support") },
];

/** البار اللي تحت زي تطبيق رسلان ماركت — في كل شاشات التصفّح */
export function NavBar() {
  const ins = useSafeAreaInsets();
  const p = usePathname();
  const { cart } = useApp();
  const n = Object.keys(cart).length;
  return (
    <View style={{ position: "absolute", left: 14, right: 14, bottom: 10 + ins.bottom, backgroundColor: C.white, borderRadius: 24, flexDirection: "row", alignItems: "center", paddingVertical: 9, paddingHorizontal: 4, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 }}>
      {ITEMS.map((it) => {
        const on = it.match(p);
        const go = () => router.navigate(it.href);
        if (it.href === "/cart") return (
          <Pressable key={it.href} onPress={go} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.y, marginTop: -34, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: C.off, elevation: 8 }}>
              <Ionicons name="cart" size={24} color={C.black} />
              <View style={{ position: "absolute", top: -4, left: -4, backgroundColor: C.black, borderRadius: 10, paddingHorizontal: 5, minWidth: 20, height: 20, justifyContent: "center" }}><Text style={{ color: C.white, fontSize: 10.5, fontFamily: F.b, textAlign: "center" }}>{n}</Text></View>
            </View>
          </Pressable>
        );
        return (
          <Pressable key={it.href} onPress={go} style={{ flex: 1, alignItems: "center", gap: 2 }}>
            <Ionicons name={on ? it.icon : (`${it.icon}-outline` as keyof typeof Ionicons.glyphMap)} size={21} color={on ? C.black : "#B0B0B0"} />
            <Text style={{ fontFamily: on ? F.x : F.b, fontSize: 10.5, color: on ? C.black : "#B0B0B0" }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
