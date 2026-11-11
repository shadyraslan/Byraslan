import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/lib/store";
import { sb } from "@/lib/supabase";
import { BlackHead, Btn, Card, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";
import type { Points } from "@/lib/types";

const KIND: Record<string, string> = { earn: "كسبت من طلب", redeem: "استبدلت", refund: "رجعتلك (طلب اتلغى)", reverse: "اتخصمت (طلب رجع)", expire: "خلصت مدتها", adjust: "من باي رسلان" };

/** نقاطي: الرصيد وقيمته، اللي هيخلص قريب، إزاي بتكسب وتستبدل، والتاريخ */
export default function PointsScreen() {
  const ins = useSafeAreaInsets();
  const { profile, tokens } = useApp();
  const [p, setP] = useState<Points | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { const { data } = await sb.rpc("app_points", { p_phone: profile.phone, p_tokens: tokens }); setP((data ?? null) as Points | null); };
  useEffect(() => { load(); }, [profile.phone, tokens.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title="نقاطي" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 + ins.bottom, gap: 14 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={async () => { setBusy(true); await load(); setBusy(false); }} />}>
        {!p ? <T style={{ color: C.mid }}>بيحمّل…</T>
          : !p.on ? <Card><T>النقاط مش شغالة دلوقتي.</T></Card>
          : !p.known ? (
            <Card title="ابدأ اجمع نقاط ⭐">
              <T style={{ fontSize: 13.5 }}>كل {p.earn_per} ج في طلباتك من التطبيق = نقطة، والنقطة بـ {p.point_value} ج. تقدر تستبدل من أول {p.min_redeem} نقطة.</T>
              <T style={{ color: C.mid, fontSize: 12 }}>نقاطك بتظهر هنا بعد أول طلب من الموبايل ده برقمك.</T>
              <Btn y title="اطلب دلوقتي" onPress={() => router.push("/")} />
            </Card>
          ) : (
            <>
              <View style={{ backgroundColor: C.black, borderRadius: 22, padding: 20, gap: 6, alignItems: "center" }}>
                <T style={{ color: "#999", fontSize: 12 }}>رصيدك{p.tier === "vip" ? " · VIP ⭐" : ""}</T>
                <T w="x" style={{ color: C.y, fontSize: 40 }}>{p.balance}</T>
                <T style={{ color: C.white }}>نقطة = {money(p.value ?? 0)}</T>
                {!!p.expiring_30 && <T style={{ color: "#F59E0B", fontSize: 12 }}>⏳ {p.expiring_30} نقطة هتخلص خلال 30 يوم</T>}
              </View>
              {p.no_points && <Card><T style={{ color: C.mid }}>حسابات الجملة مابتكسبش نقاط.</T></Card>}
              <Card title="إزاي بتشتغل">
                <T style={{ fontSize: 13 }}>• كل {p.earn_per} ج = نقطة{p.tier === "vip" ? ` (وإنت VIP × ${p.vip_mult})` : ""} — بتنزل لما الطلب يوصلك</T>
                <T style={{ fontSize: 13 }}>• النقطة بـ {p.point_value} ج، وتستبدل من أول {p.min_redeem} نقطة في صفحة تأكيد الطلب</T>
                <T style={{ fontSize: 13 }}>• تقدر تدفع بالنقاط لحد {p.max_pct}% من الطلب</T>
                <T style={{ fontSize: 13 }}>• النقاط بتخلص بعد {p.expire_months} شهور، والأقدم بيتصرف الأول</T>
              </Card>
              <Card title="التاريخ">
                {(p.history ?? []).map((h, i) => (
                  <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.border }}>
                    <View style={{ flex: 1 }}><T w="b" style={{ fontSize: 13 }}>{KIND[h.kind] ?? h.kind}</T><T style={{ color: C.mid, fontSize: 11 }}>{h.note ?? ""} · {new Date(h.at).toLocaleDateString("ar-EG")}</T></View>
                    <T w="x" style={{ color: h.points > 0 ? C.green : C.red }}>{h.points > 0 ? "+" : ""}{h.points}</T>
                  </View>))}
                {!p.history?.length && <T style={{ color: C.mid }}>لسه مفيش حركات</T>}
              </Card>
            </>
          )}
      </ScrollView>
    </View>
  );
}
