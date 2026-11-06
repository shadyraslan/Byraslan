import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHome } from "@/lib/home";
import { errMsg, sb } from "@/lib/supabase";
import { Btn, Card, Err, Head, T } from "@/lib/ui";

export default function Policy() {
  const ins = useSafeAreaInsets();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const { h } = useHome();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const accept = async () => {
    setBusy(true);
    const { error } = await sb.rpc("staff_accept_policy");
    setBusy(false);
    if (error) return setErr(errMsg(error));
    router.replace("/");
  };
  return (
    <View style={{ flex: 1 }}>
      <Head title="لايحة الشغل" back={!!view} sub={h?.policy ? `نسخة ${h.policy.ver}` : undefined} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 120 + ins.bottom }}>
        <Card><T style={{ lineHeight: 28 }}>{h?.policy?.text ?? "…"}</T></Card>
        <Err t={err} />
      </ScrollView>
      {!view && <View style={{ position: "absolute", left: 18, right: 18, bottom: 18 + ins.bottom }}><Btn y title="قريت اللايحة وموافق" onPress={accept} busy={busy} /></View>}
    </View>
  );
}
