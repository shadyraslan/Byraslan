import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "@/lib/store";
import { Box, Opt, Pill, T, WTop } from "@/lib/ui";
import { C, money } from "@/lib/theme";

// موقع التوصيل: العميل يختار حيّه أو عنوان محفوظ، والفرع بيتحدد لوحده من مناطق التوصيل
export default function Loc() {
  const { config, district, setDistrict, me } = useApp();
  const cities = [...new Set((config?.districts ?? []).map((d) => d.city))];
  const [city, setCity] = useState<string | null>(district?.city ?? null);
  const cur = city ?? cities[0];
  const pick = (id: number) => { setDistrict(id); router.back(); };
  return (
    <View style={{ flex: 1 }}>
      <WTop title="موقع التوصيل" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {!!me?.addresses.length && (
          <Box title="عناويني">
            {me.addresses.map((a) => (
              <Opt key={a.id} on={a.district_id === district?.id && a.is_default} onPress={() => a.district_id && pick(a.district_id)}>
                <T w="x" style={{ fontSize: 13 }}>{a.label} — {a.area}</T>
                <T style={{ color: C.g, fontSize: 11.5 }} numberOfLines={1}>{a.address}</T>
              </Opt>
            ))}
            <Pressable onPress={() => router.push("/address")}><T w="b" style={{ color: C.yDark }}>+ عنوان جديد</T></Pressable>
          </Box>
        )}
        <Box title="اختار منطقتك">
          <View style={{ flexDirection: "row", gap: 8 }}>{cities.map((c) => <Pill key={c} label={c} on={cur === c} onPress={() => setCity(c)} />)}</View>
          {(config?.districts ?? []).filter((d) => d.city === cur).map((d) => (
            <Opt key={d.id} on={district?.id === d.id} onPress={() => pick(d.id)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <T w="x" style={{ fontSize: 13.5 }}>{d.name}</T>
                <T style={{ color: d.branch ? C.g : C.bad, fontSize: 11.5 }}>{d.branch ? `فرع ${d.branch_name} · توصيل ${money(d.fee)}` : "لسه مش متغطية"}</T>
              </View>
            </Opt>
          ))}
          {!config && <T style={{ color: C.g }}>بيحمّل…</T>}
        </Box>
      </ScrollView>
    </View>
  );
}
