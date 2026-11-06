import { useEffect, useState } from "react";
import { I18nManager } from "react-native";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import * as Notifications from "expo-notifications";
import { sb } from "@/lib/supabase";
import { C } from "@/lib/theme";

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

export default function Root() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const seg = useSegments();
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const s = Notifications.addNotificationResponseReceivedListener(() => router.push("/messages"));
    return () => s.remove();
  }, []);
  useEffect(() => {
    if (session === undefined) return;
    const atLogin = seg[0] === "login";
    if (!session && !atLogin) router.replace("/login");
    if (session && atLogin) router.replace("/");
  }, [session, seg]);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.off } }} />
    </SafeAreaProvider>
  );
}
