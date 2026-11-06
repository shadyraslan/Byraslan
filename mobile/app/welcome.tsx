import { View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/lib/store";
import { Btn, T } from "@/lib/ui";
import { C } from "@/lib/theme";

// شاشة البداية زي التصميم — "ابدأ دلوقتي" و"تخطي" الاتنين بيدخلوا التطبيق على طول
export default function Welcome() {
  const ins = useSafeAreaInsets();
  const { markSeen, district } = useApp();
  const go = () => { markSeen(); router.replace(district ? "/" : "/loc"); };
  return (
    <View style={{ flex: 1, backgroundColor: C.black, overflow: "hidden" }}>
      <View style={{ position: "absolute", width: 300, height: 300, borderRadius: 150, backgroundColor: "#1A1A1A", top: -120, left: -110 }} />
      <View style={{ position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "#141414", bottom: -90, right: -100 }} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, gap: 16 }}>
        <View style={{ width: 92, height: 92, borderRadius: 24, backgroundColor: C.y, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <T w="x" style={{ fontSize: 30, textAlign: "center" }}>R</T>
        </View>
        <T w="x" style={{ color: C.white, fontSize: 30, textAlign: "center", lineHeight: 44 }}>اطلب طازج،{"\n"}وصّل <T w="x" style={{ color: C.y, fontSize: 30 }}>بسرعة</T></T>
        <T style={{ color: "#888", fontSize: 13.5, textAlign: "center", lineHeight: 22 }}>أفضل المنتجات الطازجة{"\n"}على بابك في 30 دقيقة</T>
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: ins.bottom + 28, gap: 14 }}>
        <Btn y title="ابدأ دلوقتي" onPress={go} />
        <T w="b" style={{ color: "#777", textAlign: "center", fontSize: 13 }} onPress={go}>تخطّي</T>
      </View>
    </View>
  );
}
