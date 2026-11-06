import { useEffect } from "react";
import { I18nManager } from "react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { useFonts, Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold, Cairo_800ExtraBold } from "@expo-google-fonts/cairo";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "@/lib/store";
import { C } from "@/lib/theme";

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Root() {
  const [loaded] = useFonts({ Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold, Cairo_800ExtraBold });
  useEffect(() => { if (loaded) SplashScreen.hideAsync().catch(() => {}); }, [loaded]);
  useEffect(() => {
    const s = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = r.notification.request.content.data as { token?: string; notice?: number; ticket?: string } | undefined;
      if (d?.ticket) router.push(`/chat/${d.ticket}`);
      else if (d?.token) router.push(`/order/${d.token}`);
      else if (d?.notice) router.push("/notices");
    });
    return () => s.remove();
  }, []);
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.off }, animation: "slide_from_left" }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" options={{ animation: "fade" }} />
          <Stack.Screen name="done/[token]" options={{ animation: "fade", gestureEnabled: false }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
