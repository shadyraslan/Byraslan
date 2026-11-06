import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useApp } from "@/lib/store";
import { errMsg, sb } from "@/lib/supabase";
import { BottomBar, Box, Btn, Err, Input, Opt, Pill, T, WTop } from "@/lib/ui";
import { C, money } from "@/lib/theme";

export default function AddressForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { me, config, district, refreshMe, setDistrict, session } = useApp();
  const old = me?.addresses.find((a) => String(a.id) === id);
  const [label, setLabel] = useState(old?.label ?? "البيت");
  const [address, setAddress] = useState(old?.address ?? "");
  const [dId, setDId] = useState<number | null>(old?.district_id ?? district?.id ?? null);
  const d = config?.districts.find((x) => x.id === dId);
  const [city, setCity] = useState<string | null>(d?.city ?? null);
  const cities = [...new Set((config?.districts ?? []).map((x) => x.city))];
  const cur = city ?? cities[0];
  const [def, setDef] = useState(old?.is_default ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!session) return <View style={{ flex: 1 }}><WTop title="عنوان جديد" /><Box><T>سجّل دخول الأول</T><Btn y title="تسجيل الدخول" onPress={() => router.replace("/login")} /></Box></View>;

  const save = async () => {
    setErr(null); setBusy(true);
    const { error } = await sb.rpc("app_address_save", { p_id: old?.id ?? null, p_label: label, p_district: dId, p_address: address, p_default: def });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    if (dId && def) setDistrict(dId);
    await refreshMe();
    router.back();
  };
  return (
    <View style={{ flex: 1 }}>
      <WTop title={old ? "تعديل العنوان" : "عنوان جديد"} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Box title="اسم العنوان">
          <View style={{ flexDirection: "row", gap: 8 }}>{["البيت", "الشغل", "تاني"].map((l) => <Pill key={l} label={l} on={label === l} onPress={() => setLabel(l)} />)}</View>
        </Box>
        <Box title="المنطقة">
          <View style={{ flexDirection: "row", gap: 8 }}>{cities.map((c) => <Pill key={c} label={c} on={cur === c} onPress={() => setCity(c)} />)}</View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(config?.districts ?? []).filter((x) => x.city === cur).map((x) => <Pill key={x.id} label={x.name} on={dId === x.id} onPress={() => setDId(x.id)} />)}
          </View>
          {d && <T style={{ color: d.branch ? C.g : C.bad, fontSize: 12 }}>{d.branch ? `هيوصلك من فرع ${d.branch_name} · التوصيل ${money(d.fee)}` : `منطقة ${d.name} لسه مش متغطية — هنسجّلها ونبلغك أول ما نوصلها`}</T>}
        </Box>
        <Box title="العنوان بالتفصيل">
          <Input value={address} onChangeText={setAddress} placeholder="الشارع، رقم العمارة، الدور، الشقة، علامة مميزة" multiline style={{ minHeight: 90, textAlignVertical: "top", paddingTop: 10 }} />
          <Opt on={def} onPress={() => setDef(!def)}><T w="b">خليه العنوان الأساسي</T></Opt>
        </Box>
        <Err t={err} />
      </ScrollView>
      <BottomBar><Btn y title="حفظ العنوان" onPress={save} busy={busy} disabled={!address.trim() || !dId} style={{ flex: 1 }} /></BottomBar>
    </View>
  );
}
