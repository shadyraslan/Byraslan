import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Btn, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";

export default function Done() {
  const { token, no, total } = useLocalSearchParams<{ token: string; no?: string; total?: string }>();
  const ins = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.ink, paddingTop: ins.top + 40, paddingBottom: ins.bottom + 20, paddingHorizontal: 24, justifyContent: "space-between" }}>
      <View style={{ alignItems: "center", gap: 14 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: C.y, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="checkmark" size={56} color={C.ink} />
        </View>
        <T w="x" style={{ color: "#fff", fontSize: 24, textAlign: "center" }}>تم الطلب!</T>
        {no ? <T w="b" style={{ color: C.y, fontSize: 16, textAlign: "center" }}>طلب رقم {no}</T> : null}
        <T style={{ color: "#aaa", textAlign: "center" }}>وصلنا طلبك والفرع هيبدأ يجهّزه. هيوصلك إشعار مع كل خطوة.</T>
        {total ? <T w="b" style={{ color: "#fff", textAlign: "center" }}>الإجمالي التقريبي {money(Number(total))}</T> : null}
      </View>
      <View style={{ gap: 10 }}>
        <Btn y title="تابع طلبك" onPress={() => router.replace(`/order/${token}`)} />
        <Btn light title="ارجع للرئيسية" onPress={() => router.replace("/")} />
      </View>
    </View>
  );
}
