import { useState } from "react";
import { Linking, RefreshControl, ScrollView, Text, View } from "react-native";
import { webUrl } from "@/lib/cs";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hhmm, orderTotal, useTrack } from "@/lib/track";
import { BlackHead, Btn, Card, T } from "@/lib/ui";
import { C, STATUS, money } from "@/lib/theme";

const STEPS: { k: string; l: string; ic: string; at: "created_at" | "accepted_at" | "out_at" | "delivered_at" }[] = [
  { k: "new", l: "تم استلام الطلب", ic: "📥", at: "created_at" },
  { k: "preparing", l: "جاري التحضير", ic: "👨‍🍳", at: "accepted_at" },
  { k: "out", l: "خرج للتوصيل", ic: "🛵", at: "out_at" },
  { k: "delivered", l: "تم التوصيل", ic: "🏠", at: "delivered_at" },
];
const idxOf = (s: string) => ({ new: 0, accepted: 1, preparing: 1, ready: 1, out: 2, delivered: 3 } as Record<string, number>)[s] ?? 0;

export default function Track() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const ins = useSafeAreaInsets();
  const { o, load } = useTrack(token);
  const [refreshing, setRefreshing] = useState(false);
  if (!o) return <View style={{ flex: 1 }}><BlackHead title="تتبع الطلب" /><T style={{ padding: 20, color: C.mid }}>بيحمّل…</T></View>;
  const idx = idxOf(o.status);
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title="تتبع الطلب" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 + ins.bottom, gap: 14 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <View style={{ backgroundColor: C.ySoft, borderRadius: 18, padding: 16, gap: 4 }}>
          <T w="b" style={{ color: C.mid, fontSize: 12 }}>#{o.no} · فرع {o.branch}</T>
          <T w="x" style={{ fontSize: 18 }}>{o.status === "cancelled" ? "❌ الطلب اتلغى" : `${STEPS[idx].ic} ${STATUS[o.status]}`}</T>
          {o.status === "cancelled" ? <T style={{ color: C.red }}>{o.cancel_reason}</T>
            : o.status !== "delivered" ? <T style={{ color: C.mid }}>الوصول المتوقع خلال <T w="x">{o.status === "out" ? "15-20" : "35-45"} دقيقة</T></T> : null}
        </View>
        {o.booking && o.scheduled_for && o.status !== "cancelled" && (
          <Card title="📅 حجز">
            <T w="x">{new Date(o.scheduled_for).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })} — الساعة {o.slot}</T>
            {!!o.deposit && <T style={{ color: o.deposit_paid ? C.green : C.mid }}>{o.deposit_paid ? `✅ العربون ${o.deposit} ج اتدفع` : `العربون المطلوب ${o.deposit} ج`}</T>}
            {o.can_edit ? <Btn outline title="✏️ عدّل الحجز (الميعاد، الأصناف، العنوان، الإلغاء)" onPress={() => Linking.openURL(`${webUrl}/t/${token}`)} />
              : <T style={{ color: C.mid, fontSize: 12 }}>التعديل خلص وقته — كلّم خدمة العملاء لو محتاج حاجة</T>}
          </Card>
        )}
        {o.status !== "cancelled" && (
          <Card>
            {STEPS.map((s, i) => {
              const done = i < idx || o.status === "delivered";
              const cur = i === idx && o.status !== "delivered";
              return (
                <View key={s.k} style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ alignItems: "center" }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: done ? C.black : cur ? C.y : C.off, borderWidth: done || cur ? 0 : 1.5, borderColor: C.border }}>
                      <Text style={{ fontSize: 15 }}>{done ? "✓" : s.ic}</Text>
                    </View>
                    {i < STEPS.length - 1 && <View style={{ width: 2, height: 26, backgroundColor: done ? C.black : C.border }} />}
                  </View>
                  <View style={{ flex: 1, paddingTop: 4 }}>
                    <T w={cur ? "x" : "b"} style={{ color: done || cur ? C.black : C.mid }}>{s.l}</T>
                    <T style={{ color: C.mid, fontSize: 11.5 }}>{hhmm(o[s.at])}</T>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
        {o.driver && (
          <Card title="المندوب">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.black, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 22 }}>🛵</Text></View>
              <T w="x" style={{ flex: 1 }}>{o.driver}</T>
            </View>
          </Card>
        )}
        <Card title={`${o.lines.length} منتجات · ${money(orderTotal(o))}`} right={<T w="b" style={{ color: C.mid, fontSize: 12 }} onPress={() => router.push(`/detail/${token}`)}>التفاصيل</T>}>
          <T style={{ color: C.mid, fontSize: 12.5 }} numberOfLines={2}>{o.lines.map((l) => `${l.icon ?? ""} ${l.name}`).join(" · ")}</T>
        </Card>
        <Btn outline title="مشكلة في الطلب؟" onPress={() => router.push(`/complaint/${token}`)} />
        <Btn outline title="💬 كلّم خدمة العملاء عن الطلب ده" onPress={() => router.push({ pathname: "/chat/new", params: { topic: "issue", order: token } })} />
      </ScrollView>
    </View>
  );
}
