import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/lib/store";
import { errMsg, sb } from "@/lib/supabase";
import { Box, Btn, Err, Input, T } from "@/lib/ui";
import { C } from "@/lib/theme";

export default function Account() {
  const ins = useSafeAreaInsets();
  const { session, me, refreshMe, district } = useApp();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => { setName(me?.name ?? ""); }, [me?.name]);

  const Row = ({ icon, label, onPress, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) => (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.ln }}>
      <Ionicons name={icon} size={20} color={color ?? C.ink} />
      <T w="b" style={{ flex: 1, color }}>{label}</T>
      <Ionicons name="chevron-back" size={16} color={C.g} />
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
      <View style={{ backgroundColor: C.ink, paddingTop: ins.top + 16, paddingHorizontal: 16, paddingBottom: 20, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.y, alignItems: "center", justifyContent: "center" }}><Ionicons name="person" size={28} color={C.ink} /></View>
        <View style={{ flex: 1 }}>
          <T w="x" style={{ color: "#fff", fontSize: 17 }}>{session ? me?.name || "عميلنا" : "زائر"}</T>
          <T style={{ color: "#999", fontSize: 12 }}>{session ? me?.phone : "سجّل دخول عشان تطلب وتتابع"}</T>
        </View>
      </View>
      {!session ? (
        <Box><Btn y title="تسجيل الدخول بالموبايل" onPress={() => router.push("/login")} /></Box>
      ) : (
        <>
          <Box title="اسمك">
            <Input value={name} onChangeText={(t) => { setName(t); setOk(false); }} placeholder="الاسم" />
            <Btn light title={ok ? "اتحفظ ✓" : "حفظ الاسم"} onPress={async () => { setErr(null); const { error } = await sb.rpc("app_save_name", { p_name: name }); if (error) setErr(errMsg(error)); else { setOk(true); refreshMe(); } }} />
          </Box>
          <Err t={err} />
          <Box title="عناويني">
            {(me?.addresses ?? []).map((a) => (
              <View key={a.id} style={{ borderWidth: 1.5, borderColor: a.is_default ? C.ink : C.ln, backgroundColor: a.is_default ? C.soft : C.panel, borderRadius: 12, padding: 10, gap: 2 }}>
                <T w="x" style={{ fontSize: 13 }}>{a.label} — {a.area}{a.is_default ? " · الأساسي" : ""}</T>
                <T style={{ color: C.g, fontSize: 12 }}>{a.address}</T>
                <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
                  <T w="b" style={{ color: C.yDark }} onPress={() => router.push({ pathname: "/address", params: { id: String(a.id) } })}>تعديل</T>
                  <T w="b" style={{ color: C.bad }} onPress={() => Alert.alert("تشيل العنوان ده؟", a.address, [{ text: "لا" }, { text: "شيله", style: "destructive", onPress: async () => { await sb.rpc("app_remove_address", { p_id: a.id }); refreshMe(); } }])}>شيل</T>
                </View>
              </View>
            ))}
            <Pressable onPress={() => router.push("/address")}><T w="b" style={{ color: C.yDark }}>+ عنوان جديد</T></Pressable>
          </Box>
        </>
      )}
      <Box>
        <Row icon="location-outline" label={`منطقة التوصيل: ${district?.name ?? "اختار"}`} onPress={() => router.push("/loc")} />
        <Row icon="receipt-outline" label="طلباتي" onPress={() => router.push("/orders")} />
        {session && <Row icon="log-out-outline" label="خروج" onPress={() => sb.auth.signOut()} />}
        {session && <Row icon="trash-outline" label="طلب مسح الحساب" color={C.bad} onPress={() => Alert.alert("مسح الحساب", "هنمسح حسابك وبياناتك خلال 48 ساعة. متأكد؟", [{ text: "لا" }, { text: "امسح", style: "destructive", onPress: async () => { await sb.rpc("app_request_delete"); await sb.auth.signOut(); } }])} />}
      </Box>
    </ScrollView>
  );
}
