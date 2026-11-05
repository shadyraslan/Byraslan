import { useEffect } from "react";
import { I18nManager } from "react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { useFonts, Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold, Cairo_800ExtraBold } from "@expo-google-fonts/cairo";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "@/lib/store";
import { C, F } from "@/lib/theme";

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Root() {
  const [loaded] = useFonts({ Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold, Cairo_800ExtraBold });
  useEffect(() => { if (loaded) SplashScreen.hideAsync().catch(() => {}); }, [loaded]);
  useEffect(() => {
    const s = Notifications.addNotificationResponseReceivedListener((r) => {
      const t = (r.notification.request.content.data as { token?: string } | undefined)?.token;
      if (t) router.push(`/order/${t}`);
    });
    return () => s.remove();
  }, []);
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: C.black }, headerTintColor: C.y, headerTitleStyle: { fontFamily: F.b }, contentStyle: { backgroundColor: C.bg }, headerBackTitle: "رجوع" }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: "تسجيل الدخول", presentation: "modal" }} />
          <Stack.Screen name="address" options={{ title: "العنوان", presentation: "modal" }} />
          <Stack.Screen name="order/[token]" options={{ title: "متابعة الطلب" }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
