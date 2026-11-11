import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/lib/store";
import { T } from "@/lib/ui";
import { C } from "@/lib/theme";

type R = [string, string, string, () => void, string?];

export default function Account() {
  const ins = useSafeAreaInsets();
  const { profile, tokens, district } = useApp();
  const groups: [string, R[]][] = [
    ["الطلبات", [["📋", "طلباتي", `${tokens.length} طلب`, () => router.push("/orders")], ["🗺", "تتبع طلب", "آخر طلب", () => (tokens[0] ? router.push(`/order/${tokens[0]}`) : router.push("/orders"))], ["🔥", "العروض", "", () => router.push("/offers")], ["⭐", "نقاطي", "اجمع واستبدل", () => router.push("/points")]]],
    ["الحساب", [["👤", "بياناتي", profile.name || "الاسم والموبايل", () => router.push("/profile")], ["📍", "عناويني", `${profile.addresses.length} عنوان · ${district?.name ?? "اختار منطقتك"}`, () => router.push("/loc")], ["🔔", "الإشعارات", "رسايل باي رسلان ليك", () => router.push("/notices")]]],
    ["الدعم", [["💬", "خدمة العملاء", "", () => router.push("/support")], ["📄", "الشروط والأحكام", "", () => router.push({ pathname: "/legal", params: { k: "terms" } })], ["🔒", "سياسة الخصوصية", "", () => router.push({ pathname: "/legal", params: { k: "privacy" } })]]],
  ];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 130 + ins.bottom }}>
      <View style={{ backgroundColor: C.black, paddingTop: ins.top + 24, paddingBottom: 24, alignItems: "center", gap: 6 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.y, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 34 }}>👤</Text></View>
        <T w="x" style={{ color: C.white, fontSize: 19, textAlign: "center" }}>{profile.name || "أهلاً بيك"}</T>
        <T style={{ color: "#888", textAlign: "center", fontSize: 12.5 }}>{profile.phone || "ضيف اسمك ورقمك من «بياناتي»"}</T>
      </View>
      <View style={{ padding: 18, gap: 16 }}>
        {groups.map(([g, rows]) => (
          <View key={g} style={{ gap: 8 }}>
            <T w="b" style={{ color: C.mid, fontSize: 12 }}>{g}</T>
            <View style={{ backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
              {rows.map(([ic, l, s, fn, on], i) => (
                <Pressable key={l} onPress={fn} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: C.border }}>
                  <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: C.off, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 17 }}>{ic}</Text></View>
                  <View style={{ flex: 1 }}><T w="x" style={{ fontSize: 13.5 }}>{l}</T>{s ? <T style={{ color: C.mid, fontSize: 11.5 }}>{s}</T> : null}</View>
                  {on ? <View style={{ width: 40, height: 24, borderRadius: 12, backgroundColor: C.y, justifyContent: "center", paddingHorizontal: 3 }}><View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: C.white, alignSelf: "flex-start" }} /></View> : <Ionicons name="chevron-back" size={16} color={C.mid} />}
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <T style={{ color: "#BBB", textAlign: "center", fontSize: 11 }}>باي رسلان · نسخة تجربة</T>
      </View>
    </ScrollView>
  );
}
