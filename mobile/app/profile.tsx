import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "@/lib/store";
import { BlackHead, BottomBar, Btn, Card, Err, Input, T } from "@/lib/ui";
import { C } from "@/lib/theme";

export default function Profile() {
  const { profile, saveProfile } = useApp();
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    const d = phone.replace(/\D/g, "");
    if (name.trim().length < 2) return setErr("اكتب اسمك");
    if (d && !/^0?1[0125]\d{8}$/.test(d)) return setErr("اكتب رقم موبايل مصري صحيح");
    saveProfile({ name: name.trim(), phone: d });
    router.back();
  };
  return (
    <View style={{ flex: 1 }}>
      <BlackHead title="بياناتي" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Card title="الاسم"><Input value={name} onChangeText={setName} placeholder="اسمك" /></Card>
        <Card title="رقم الموبايل">
          <Input value={phone} onChangeText={setPhone} placeholder="01xxxxxxxxx" keyboardType="phone-pad" style={{ textAlign: "left" }} />
          <T style={{ color: C.mid, fontSize: 11.5 }}>الفرع والطيار بيكلموك عليه بخصوص طلبك.</T>
        </Card>
        <Err t={err} />
      </ScrollView>
      <BottomBar><Btn y title="حفظ" onPress={save} style={{ flex: 1 }} /></BottomBar>
    </View>
  );
}
