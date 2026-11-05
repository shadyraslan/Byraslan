import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useApp } from "@/lib/store";
import { errMsg, sb } from "@/lib/supabase";
import { Btn, Chip, Err, Input, T } from "@/lib/ui";

export default function AddressForm() {
  const { id, loc } = useLocalSearchParams<{ id?: string; loc?: string }>();
  const { me, config, branch, refreshMe, setBranch } = useApp();
  const old = me?.addresses.find((a) => String(a.id) === id);
  const [label, setLabel] = useState(old?.label ?? "البيت");
  const [area, setArea] = useState(old?.area ?? "");
  const [address, setAddress] = useState(old?.address ?? "");
  const [b, setB] = useState<string | null>(old?.location_id ?? (loc || branch));
  const [def, setDef] = useState(old?.is_default ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null); setBusy(true);
    const { error } = await sb.rpc("app_save_address", { p_id: old?.id ?? null, p_label: label, p_area: area, p_address: address, p_loc: b, p_default: def });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    if (b && def) setBranch(b);
    await refreshMe();
    router.back();
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: "row", gap: 8 }}>{["البيت", "الشغل", "تاني"].map((l) => <Chip key={l} label={l} on={label === l} onPress={() => setLabel(l)} />)}</View>
      <Input value={area} onChangeText={setArea} placeholder="المنطقة" />
      <Input value={address} onChangeText={setAddress} placeholder="الشارع، العمارة، الدور، الشقة، علامة مميزة" multiline style={{ minHeight: 90, textAlignVertical: "top", paddingTop: 12, textAlign: "right" }} />
      <T w="b">أقرب فرع</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{(config?.branches ?? []).map((x) => <Chip key={x.id} label={x.name} on={b === x.id} onPress={() => setB(x.id)} />)}</View>
      <Chip label={def ? "✓ العنوان الأساسي" : "خليه العنوان الأساسي"} on={def} onPress={() => setDef(!def)} />
      <Err t={err} />
      <Btn title="حفظ العنوان" onPress={save} busy={busy} disabled={!address.trim() || !b} />
    </ScrollView>
  );
}
