import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useHome } from "@/lib/home";
import { sb } from "@/lib/supabase";
import { registerPush } from "@/lib/push";
import { Welcome } from "@/lib/welcome";
import { Badge, Btn, Card, Err, T } from "@/lib/ui";
import { C, hhmm, shiftLine } from "@/lib/theme";

const ST: Record<string, ["ok" | "wait" | "bad", string]> = { ok: ["ok", "متسجّل"], pending: ["wait", "مستني موافقة"], rejected: ["bad", "مرفوض"] };

export default function Home() {
  const ins = useSafeAreaInsets();
  const { h, err, load } = useHome();
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { registerPush(); }, []);
  if (err) return <View style={{ flex: 1, padding: 24, paddingTop: ins.top + 40, gap: 12 }}><Err t={err} /><Btn title="خروج" onPress={() => sb.auth.signOut()} /></View>;
  if (!h) return <View style={{ flex: 1, backgroundColor: C.black }} />;
  if (!h.policy_ok && h.policy) { router.replace("/policy"); return null; }
  const isIn = h.state === "in";
  const Tile = ({ ic, t, s, onPress, badge }: { ic: keyof typeof Ionicons.glyphMap; t: string; s: string; onPress: () => void; badge?: number }) => (
    <Pressable onPress={onPress} style={{ flex: 1, minWidth: "45%", backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 6 }}>
      <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: C.ySoft, alignItems: "center", justifyContent: "center" }}><Ionicons name={ic} size={22} color={C.black} /></View>
      <T b>{t}</T><T style={{ color: C.mid, fontSize: 12.5 }}>{s}</T>
      {!!badge && <View style={{ position: "absolute", top: 12, left: 12, backgroundColor: C.red, borderRadius: 11, minWidth: 22, height: 22, alignItems: "center", justifyContent: "center" }}><T b style={{ color: C.white, fontSize: 12, textAlign: "center" }}>{badge}</T></View>}
    </Pressable>
  );
  return (
    <>
    <Welcome />
    <ScrollView contentContainerStyle={{ paddingBottom: 40 + ins.bottom }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <View style={{ backgroundColor: C.black, paddingTop: ins.top + 16, paddingHorizontal: 20, paddingBottom: 70, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <T style={{ color: "#999", fontSize: 13 }}>صباح الفل 👋</T>
            <T b style={{ color: C.white, fontSize: 22 }}>{h.name}</T>
            <T style={{ color: C.y, fontSize: 13 }}>{[h.job, h.home_name].filter(Boolean).join(" · ")}</T>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => router.push({ pathname: "/policy", params: { view: "1" } })} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,.1)", alignItems: "center", justifyContent: "center" }}><Ionicons name="document-text-outline" size={20} color={C.y} /></Pressable>
            <Pressable onPress={() => router.push("/messages")} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,.1)", alignItems: "center", justifyContent: "center" }}><Ionicons name="notifications-outline" size={20} color={C.white} />{!!h.unread && <View style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: C.y }} />}</Pressable>
            <Pressable onPress={() => sb.auth.signOut()} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,.1)", alignItems: "center", justifyContent: "center" }}><Ionicons name="log-out-outline" size={20} color={C.white} /></Pressable>
          </View>
        </View>
      </View>
      <View style={{ marginTop: -50, paddingHorizontal: 18, gap: 14 }}>
        <Card style={{ alignItems: "center", paddingVertical: 22 }}>
          <T style={{ color: C.mid }}>{isIn ? `حاضر من ${hhmm(h.last?.at)}${h.last?.loc ? ` · ${h.last.loc}` : ""}` : "مش مسجّل حضور دلوقتي"}</T>
          <Pressable onPress={() => router.push({ pathname: "/punch", params: { kind: isIn ? "out" : "in" } })}
            style={({ pressed }) => ({ width: 150, height: 150, borderRadius: 75, backgroundColor: isIn ? C.black : C.y, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.96 : 1 }], shadowColor: C.y, shadowOpacity: isIn ? 0 : 0.5, shadowRadius: 18, elevation: 8 })}>
            <Ionicons name={isIn ? "exit-outline" : "finger-print"} size={44} color={isIn ? C.y : C.black} />
            <T b style={{ color: isIn ? C.white : C.black, fontSize: 18, marginTop: 6, textAlign: "center" }}>{isIn ? "انصراف" : "حضور"}</T>
          </Pressable>
          {h.last?.status === "pending" && <Badge kind="wait" t="آخر تسجيل مستني موافقة المدير" />}
          {(h.shift_today || h.shift_tomorrow) && <T style={{ color: C.mid, fontSize: 13, textAlign: "center" }}>{[h.shift_today && `النهارده: ${shiftLine(h.shift_today)}`, h.shift_tomorrow && `بكره: ${shiftLine(h.shift_tomorrow)}`].filter(Boolean).join("  ·  ")}</T>}
        </Card>
        {!!h.today.length && (
          <Card>
            <T b>النهارده</T>
            {h.today.map((a, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T>{a.kind === "in" ? "🟢 حضور" : "🔴 انصراف"} · {hhmm(a.at)}</T>
                <Badge kind={ST[a.status][0]} t={ST[a.status][1]} />
              </View>
            ))}
          </Card>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Tile ic="wallet-outline" t="مرتبي" s="الكشف والأرصدة" onPress={() => router.push("/salary")} />
          <Tile ic="time-outline" t="ساعاتي" s="اشتغلت كام وفاضل كام" onPress={() => router.push("/hours")} />
          <Tile ic="calendar-outline" t="إجازة أو سلفة" s="اطلب وتابع الرد" onPress={() => router.push("/leaves")} />
          <Tile ic="cash-outline" t="عهدتي" s="صرفت · سلّمت" onPress={() => router.push("/custody")} />
          <Tile ic="document-attach-outline" t="أوراقي" s="شهادة مرتب وغيرها" onPress={() => router.push("/docs")} />
          <Tile ic="star-outline" t="تقييمي" s="تقييم الأداء" onPress={() => router.push("/appraisal")} />
          {h.is_manager && <Tile ic="people-outline" t="فريقي" s="ساعاتهم والأذون" onPress={() => router.push("/team")} />}
          <Tile ic="chatbubbles-outline" t="رسايل الإدارة" s={h.unread ? `${h.unread} جديدة` : "مفيش جديد"} badge={h.unread} onPress={() => router.push("/messages")} />
          {h.is_driver && <Tile ic="car-outline" t="رحلاتي" s="التحميل والفروع" onPress={() => router.push("/trips")} />}
          <Tile ic="document-text-outline" t="اللايحة" s="لايحة الشغل" onPress={() => router.push({ pathname: "/policy", params: { view: "1" } })} />
        </View>
      </View>
    </ScrollView>
    </>
  );
}
