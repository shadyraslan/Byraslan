import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/lib/store";
import { BlackHead, BottomBar, Btn, Card, Chip, Radio, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";

// موقع التوصيل: عنوان محفوظ أو الحي — والفرع بيتحدد لوحده من مناطق التوصيل
export default function Loc() {
  const ins = useSafeAreaInsets();
  const { config, district, setDistrict, profile, saveAddress, removeAddress } = useApp();
  const cities = [...new Set((config?.districts ?? []).map((d) => d.city))];
  const [city, setCity] = useState<string | null>(district?.city ?? null);
  const [sel, setSel] = useState<number | null>(district?.id ?? null);
  const cur = city ?? cities[0];
  const D = config?.districts.find((d) => d.id === sel);
  const confirm = () => { if (sel) setDistrict(sel); if (router.canGoBack()) router.back(); else router.replace("/"); };
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title="موقع التوصيل" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 + ins.bottom, gap: 12 }}>
        <Card title="عناوين محفوظة" right={<T w="b" style={{ color: C.mid, fontSize: 12 }} onPress={() => router.push("/address")}>+ إضافة عنوان</T>}>
          {!profile.addresses.length && <T style={{ color: C.mid, fontSize: 12.5 }}>لسه مفيش عناوين — ضيف عنوانك عشان تطلب أسرع.</T>}
          {profile.addresses.map((a) => {
            const d = config?.districts.find((x) => x.id === a.district_id);
            return (
              <Radio key={a.id} on={sel === a.district_id && a.is_default} onPress={() => { saveAddress({ ...a, is_default: true }); setSel(a.district_id); }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.off, alignItems: "center", justifyContent: "center" }}><Ionicons name={a.label === "الشغل" ? "briefcase-outline" : "home-outline"} size={17} color={C.black} /></View>
                  <View style={{ flex: 1 }}>
                    <T w="x" style={{ fontSize: 13 }}>{a.label} — {d?.name}</T>
                    <T style={{ color: C.mid, fontSize: 11.5 }} numberOfLines={1}>{a.address}</T>
                    <View style={{ flexDirection: "row", gap: 14 }}>
                      <T w="b" style={{ fontSize: 11.5, color: C.yDark }} onPress={() => router.push({ pathname: "/address", params: { id: a.id } })}>تعديل</T>
                      <T w="b" style={{ fontSize: 11.5, color: C.red }} onPress={() => removeAddress(a.id)}>شيل</T>
                    </View>
                  </View>
                </View>
              </Radio>
            );
          })}
        </Card>
        <Card title="أو اختار منطقتك">
          <View style={{ flexDirection: "row", gap: 8 }}>{cities.map((c) => <Chip key={c} label={c} on={cur === c} onPress={() => setCity(c)} />)}</View>
          {(config?.districts ?? []).filter((d) => d.city === cur).map((d) => (
            <Pressable key={d.id} onPress={() => setSel(d.id)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1.5, borderColor: sel === d.id ? C.black : C.border, backgroundColor: sel === d.id ? C.ySoft : C.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 }}>
              <T w="x" style={{ fontSize: 13.5 }}>{d.name}</T>
              <T style={{ color: d.branch ? C.mid : C.red, fontSize: 11.5 }}>{d.branch ? `فرع ${d.branch_name} · ${d.fee ? money(d.fee) : "توصيل مجاني"}` : "لسه مش متغطية"}</T>
            </Pressable>
          ))}
          {!config && <T style={{ color: C.mid }}>بيحمّل…</T>}
        </Card>
      </ScrollView>
      <BottomBar>
        <Btn title={D ? `📍 تأكيد موقع التوصيل — ${D.name}` : "اختار منطقتك"} onPress={confirm} disabled={!sel} style={{ flex: 1 }} />
      </BottomBar>
    </View>
  );
}
