import { ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { BlackHead, Card, T } from "@/lib/ui";
import { C } from "@/lib/theme";

export default function Legal() {
  const { k } = useLocalSearchParams<{ k?: string }>();
  const privacy = k === "privacy";
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title={privacy ? "سياسة الخصوصية" : "الشروط والأحكام"} />
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        <Card>
          <T w="b" style={{ color: C.red }}>النص النهائي هيتحط بعد مراجعة المحامي.</T>
          <T style={{ color: "#555", lineHeight: 24 }}>
            {privacy
              ? "بنستخدم اسمك ورقم موبايلك وعنوانك عشان نوصلك طلبك ونكلمك بخصوصه بس. مش بنبيع بياناتك لحد. تقدر تطلب مسح بياناتك من خدمة العملاء."
              : "الأسعار المعروضة تقريبية للأصناف اللي بتتوزن، والسعر النهائي بيتحسب بالوزن الفعلي. الطلب بيتأكد من الفرع، وطريقة الدفع ممكن تتغيّر وقت الاستلام. الاسترجاع والشكاوى من صفحة الطلب أو خدمة العملاء."}
          </T>
        </Card>
      </ScrollView>
    </View>
  );
}
