import { Redirect, Tabs } from "expo-router";
import { NavBar } from "@/lib/nav";
import { useApp } from "@/lib/store";
import { C } from "@/lib/theme";

const NAMES = ["index", "cats", "cart", "orders", "account"];

export default function TabsLayout() {
  const { ready, seen } = useApp();
  if (!ready) return null;
  if (!seen) return <Redirect href="/welcome" />;
  return (
    <Tabs tabBar={() => <NavBar />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.off } }}>
      {NAMES.map((n) => <Tabs.Screen key={n} name={n} />)}
    </Tabs>
  );
}
