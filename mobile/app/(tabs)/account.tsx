import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "@/lib/store";
import { errMsg, sb } from "@/lib/supabase";
import { Btn, Card, Chip, Err, Input, T } from "@/lib/ui";
import { C } from "@/lib/theme";

export default function Account() {
  const { session, me, refreshMe, config, branch, setBranch } = useApp();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => { setName(me?.name ?? ""); }, [me?.name]);

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      <Card>
        <T w="b">الفرع</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{(config?.branches ?? []).map((b) => <Chip key={b.id} label={b.name} on={b.id === branch} onPress={() => setBranch(b.id)} />)}</View>
      </Card>
      {!session ? <Btn title="تسجيل الدخول بالموبايل" onPress={() => router.push("/login")} /> : (
        <>
          <Card>
            <T w="b">اسمك</T>
            <Input value={name} onChangeText={(t) => { setName(t); setOk(false); }} placeholder="الاسم" />
            <T style={{ color: C.muted }}>{me?.phone}</T>
            <Btn kind="sec" title={ok ? "اتحفظ ✓" : "حفظ"} onPress={async () => { setErr(null); const { error } = await sb.rpc("app_save_name", { p_name: name }); if (error) setErr(errMsg(error)); else { setOk(true); refreshMe(); } }} />
            <Err t={err} />
          </Card>
          <Card>
            <T w="b">عناويني</T>
            {(me?.addresses ?? []).map((a) => (
              <View key={a.id} style={{ borderWidth: 1, borderColor: a.is_default ? C.y : C.line, borderRadius: 14, padding: 10, gap: 2 }}>
                <T w="b">{a.label}{a.is_default ? " · الأساسي" : ""}</T>
                <T style={{ color: C.muted }}>{[a.area, a.address].filter(Boolean).join(" — ")}</T>
                <T style={{ color: C.muted, fontSize: 13 }}>فرع {config?.branches.find((b) => b.id === a.location_id)?.name ?? "—"}</T>
                <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
                  <Pressable onPress={() => router.push({ pathname: "/address", params: { id: String(a.id) } })}><T w="b" style={{ color: C.yDark }}>تعديل</T></Pressable>
                  <Pressable onPress={() => Alert.alert("تشيل العنوان ده؟", a.address, [{ text: "لا" }, { text: "شيله", style: "destructive", onPress: async () => { await sb.rpc("app_remove_address", { p_id: a.id }); refreshMe(); } }])}><T w="b" style={{ color: C.bad }}>شيل</T></Pressable>
                </View>
              </View>
            ))}
            <Btn kind="sec" title="+ عنوان جديد" onPress={() => router.push("/address")} />
          </Card>
          <Btn kind="sec" title="خروج" onPress={() => sb.auth.signOut()} />
          <Pressable onPress={() => Alert.alert("مسح الحساب", "هنمسح حسابك وبياناتك خلال 48 ساعة. متأكد؟", [{ text: "لا" }, { text: "امسح", style: "destructive", onPress: async () => { await sb.rpc("app_request_delete"); await sb.auth.signOut(); } }])}>
            <T style={{ color: C.muted, textAlign: "center", textDecorationLine: "underline" }}>طلب مسح الحساب</T>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
