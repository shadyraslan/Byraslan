import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/lib/store";
import { BlackHead, BottomBar, Btn, Card, Chip, Input, Radio, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";

export default function AddressForm() {
  const ins = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { profile, config, district, saveAddress } = useApp();
  const old = profile.addresses.find((a) => a.id === id);
  const [label, setLabel] = useState(old?.label ?? "البيت");
  const [address, setAddress] = useState(old?.address ?? "");
  const [dId, setDId] = useState<number | null>(old?.district_id ?? district?.id ?? null);
  const d = config?.districts.find((x) => x.id === dId);
  const cities = [...new Set((config?.districts ?? []).map((x) => x.city))];
  const [city, setCity] = useState<string | null>(d?.city ?? null);
  const cur = city ?? cities[0];
  const [def, setDef] = useState(old?.is_default ?? true);
  const save = () => { if (!dId) return; saveAddress({ id: old?.id, label, district_id: dId, address: address.trim(), is_default: def }); router.back(); };
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title={old ? "تعديل العنوان" : "عنوان جديد"} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 + ins.bottom, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Card title="نوع العنوان">
          <View style={{ flexDirection: "row", gap: 8 }}>{["البيت", "الشغل", "تاني"].map((l) => <Chip key={l} label={l} on={label === l} onPress={() => setLabel(l)} />)}</View>
        </Card>
        <Card title="المنطقة">
          <View style={{ flexDirection: "row", gap: 8 }}>{cities.map((c) => <Chip key={c} label={c} on={cur === c} onPress={() => setCity(c)} />)}</View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(config?.districts ?? []).filter((x) => x.city === cur).map((x) => <Chip key={x.id} label={x.name} on={dId === x.id} onPress={() => setDId(x.id)} />)}
          </View>
          {d && <T style={{ color: d.branch ? C.mid : C.red, fontSize: 12 }}>{d.branch ? `هيوصلك من فرع ${d.branch_name} · التوصيل ${d.fee ? money(d.fee) : "مجاني"}` : `منطقة ${d.name} لسه مش متغطية`}</T>}
        </Card>
        <Card title="العنوان بالتفصيل">
          <Input value={address} onChangeText={setAddress} placeholder="الشارع، رقم العمارة، الدور، الشقة، علامة مميزة" multiline style={{ minHeight: 96, textAlignVertical: "top", paddingTop: 12 }} />
          <Radio on={def} onPress={() => setDef(!def)}><T w="b">خليه العنوان الأساسي</T></Radio>
        </Card>
      </ScrollView>
      <BottomBar><Btn y title="حفظ العنوان" onPress={save} disabled={address.trim().length < 5 || !dId} style={{ flex: 1 }} /></BottomBar>
    </View>
  );
}
