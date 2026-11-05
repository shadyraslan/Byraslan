import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/lib/store";
import { C, F } from "@/lib/theme";

export default function TabsLayout() {
  const { cart } = useApp();
  const n = Object.keys(cart).length;
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />;
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: C.black }, headerTintColor: C.y, headerTitleStyle: { fontFamily: F.b },
      tabBarActiveTintColor: C.ink, tabBarInactiveTintColor: C.muted, tabBarLabelStyle: { fontFamily: F.m, fontSize: 12 },
      tabBarActiveBackgroundColor: "#FFF8D6", sceneStyle: { backgroundColor: C.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: "باي رسلان", tabBarLabel: "اطلب", tabBarIcon: icon("storefront-outline") }} />
      <Tabs.Screen name="cart" options={{ title: "السلة", tabBarIcon: icon("basket-outline"), tabBarBadge: n || undefined, tabBarBadgeStyle: { backgroundColor: C.y, color: C.ink } }} />
      <Tabs.Screen name="orders" options={{ title: "طلباتي", tabBarIcon: icon("receipt-outline") }} />
      <Tabs.Screen name="account" options={{ title: "حسابي", tabBarIcon: icon("person-outline") }} />
    </Tabs>
  );
}
