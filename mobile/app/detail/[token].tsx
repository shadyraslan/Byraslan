import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavBar } from "@/lib/nav";
import { Ionicons } from "@expo/vector-icons";
import { lineTotal, orderTotal, useTrack } from "@/lib/track";
import { useReorder } from "@/lib/reorder";
import { BlackHead, Card, Ln, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";

const ST = [["new", "تأكيد"], ["preparing", "تحضير"], ["out", "توصيل"], ["delivered", "وصل"]];
const idxOf = (s: string) => ({ new: 0, accepted: 1, preparing: 1, ready: 1, out: 2, delivered: 3 } as Record<string, number>)[s] ?? 0;

export default function Detail() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const ins = useSafeAreaInsets();
  const { o } = useTrack(token, 30000);
  const again = useReorder();
  if (!o) return <View style={{ flex: 1 }}><BlackHead title="تفاصيل الطلب" /><T style={{ padding: 20, color: C.mid }}>بيحمّل…</T></View>;
  const idx = idxOf(o.status);
  const Act = ({ ic, bg, t, s, onPress }: { ic: string; bg: string; t: string; s: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 18 }}>{ic}</Text></View>
      <View style={{ flex: 1 }}><T w="x" style={{ fontSize: 13.5 }}>{t}</T><T style={{ color: C.mid, fontSize: 11.5 }}>{s}</T></View>
      <Ionicons name="chevron-back" size={16} color={C.mid} />
    </Pressable>
  );
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title={`#${o.no}`} sub={`فرع ${o.branch}`} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 + ins.bottom, gap: 12 }}>
        <Card title="حالة الطلب">
          {o.status === "cancelled" ? <T w="b" style={{ color: C.red }}>الطلب اتلغى {o.cancel_reason ? `— ${o.cancel_reason}` : ""}</T> : (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {ST.map(([k, l], i) => (
                <View key={k} style={{ flex: i < ST.length - 1 ? 1 : 0, flexDirection: "row", alignItems: "center" }}>
                  <View style={{ alignItems: "center", gap: 4 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: i <= idx ? C.black : C.border, alignItems: "center", justifyContent: "center" }}>{i <= idx && <Ionicons name="checkmark" size={14} color={C.y} />}</View>
                    <T style={{ fontSize: 10.5, color: i <= idx ? C.black : C.mid }}>{l}</T>
                  </View>
                  {i < ST.length - 1 && <View style={{ flex: 1, height: 2, backgroundColor: i < idx ? C.black : C.border, marginBottom: 16 }} />}
                </View>
              ))}
            </View>
          )}
        </Card>
        <Card title="المنتجات">
          {o.lines.map((l, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: C.off, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 20 }}>{l.icon ?? "🛒"}</Text></View>
              <T w="b" style={{ flex: 1 }}>{l.name} × {l.prepared > 0 ? l.prepared : l.qty}</T>
              <T w="x">{money(lineTotal(l))}</T>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: C.border }} />
          {!!Number(o.discount) && <Ln l="الخصم" v={`- ${money(Number(o.discount))}`} color={C.green} />}
          <Ln l="التوصيل" v={Number(o.fee) ? money(Number(o.fee)) : "مجاني"} />
          <Ln l={o.total != null ? "الإجمالي" : "الإجمالي (لحد الوزن)"} v={money(orderTotal(o))} big />
        </Card>
        <Card title="إجراءات">
          {!["delivered", "cancelled"].includes(o.status) && <Act ic="🛵" bg={C.ySoft} t="تتبع الطلب" s="اعرف طلبك فين دلوقتي" onPress={() => router.push(`/order/${token}`)} />}
          <Act ic="🔄" bg={C.redSoft} t="استرجاع أو تبديل" s="لو في مشكلة في المنتجات" onPress={() => router.push({ pathname: "/complaint/[token]", params: { token, kind: "return" } })} />
          <Act ic="📢" bg="#FFF8E1" t="تقديم شكوى" s="مشكلة في الطلب أو التوصيل" onPress={() => router.push(`/complaint/${token}`)} />
          <Act ic="💬" bg={C.greenSoft} t="تواصل مع خدمة العملاء" s="واتساب أو مكالمة" onPress={() => router.push("/support")} />
          <Act ic="🔁" bg="#EEF4FF" t="إعادة الطلب" s="اطلب نفس المنتجات تاني" onPress={() => again(o)} />
        </Card>
      </ScrollView>
      <NavBar />
    </View>
  );
}
