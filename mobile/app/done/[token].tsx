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
    <View style={{ flex: 1, backgroundColor: C.white, paddingTop: ins.top + 30, paddingBottom: ins.bottom + 24, paddingHorizontal: 30, justifyContent: "center", gap: 16 }}>
      <View style={{ alignSelf: "center", width: 104, height: 104, borderRadius: 52, backgroundColor: C.y, alignItems: "center", justifyContent: "center", shadowColor: C.y, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 }}>
        <Ionicons name="checkmark" size={58} color={C.black} />
      </View>
      <T w="x" style={{ fontSize: 24, textAlign: "center" }}>تم تأكيد طلبك! 🎉</T>
      <T style={{ color: C.mid, textAlign: "center", lineHeight: 22 }}>طلبك في طريقه إليك{"\n"}هنبعتلك إشعار لما يتحضر</T>
      <View style={{ borderWidth: 1.5, borderColor: C.border, borderRadius: 16, padding: 14, alignItems: "center", gap: 2 }}>
        <T style={{ color: C.mid, fontSize: 11.5 }}>رقم الطلب</T>
        <T w="x" style={{ fontSize: 20, textAlign: "center" }}>#{no}</T>
        {total ? <T w="b" style={{ color: C.mid, fontSize: 12 }}>الإجمالي التقريبي {money(Number(total))}</T> : null}
      </View>
      <View style={{ alignSelf: "center", backgroundColor: C.black, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", gap: 6 }}>
        <T w="b" style={{ color: C.white }}>⏱ وقت التوصيل المتوقع</T><T w="x" style={{ color: C.y }}>35-45 دقيقة</T>
      </View>
      <Btn title="تتبع الطلب" onPress={() => router.replace(`/order/${token}`)} style={{ marginTop: 10 }} />
      <Btn outline title="الرجوع للرئيسية" onPress={() => router.replace("/")} />
    </View>
  );
}
