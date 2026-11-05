import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "@/lib/store";
import { Btn, Card, Chip, Err, Input, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";
import { errMsg, sb } from "@/lib/supabase";

const PAY: [string, string][] = [["cash", "كاش عند الاستلام"], ["card", "فيزا عند الاستلام"], ["instapay", "إنستاباي"]];

export default function Cart() {
  const { session, me, config, branch, menu, cart, add, clearCart, refreshMe } = useApp();
  const [pay, setPay] = useState("cash");
  const [note, setNote] = useState("");
  const [addr, setAddr] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const br = config?.branches.find((b) => b.id === branch);
  const lines = (menu ?? []).filter((m) => cart[m.item_id]);
  const sub = lines.reduce((a, m) => a + cart[m.item_id] * m.price, 0);
  const addrs = (me?.addresses ?? []).filter((a) => a.location_id === branch);
  const chosen = addrs.find((a) => a.id === addr) ?? addrs.find((a) => a.is_default) ?? addrs[0];

  if (!lines.length) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
      <T w="b" style={{ fontSize: 18, textAlign: "center" }}>السلة فاضية</T>
      <Btn title="ابدأ الطلب" onPress={() => router.push("/")} />
    </View>
  );

  const place = async () => {
    setErr(null);
    if (!session) return router.push("/login");
    if (!me?.name) return setErr("اكتب اسمك من صفحة حسابي");
    if (!chosen) return router.push({ pathname: "/address", params: { loc: branch ?? "" } });
    setBusy(true);
    const { data, error } = await sb.rpc("app_place_order", { p_address: chosen.id, p_note: note, p_pay: pay, p_lines: lines.map((m) => ({ item_id: m.item_id, qty: cart[m.item_id] })) });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    const r = (Array.isArray(data) ? data[0] : data) as { token: string };
    clearCart(); setNote(""); refreshMe();
    router.push(`/order/${r.token}`);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 40 }}>
      <Card>
        {lines.map((m) => (
          <View key={m.item_id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}><T w="b">{m.name}</T><T style={{ color: C.muted }}>{cart[m.item_id]} {m.unit} × {money(m.price)}</T></View>
            <Pressable onPress={() => add(m, -1)} hitSlop={8}><T w="x" style={{ fontSize: 22, paddingHorizontal: 8 }}>−</T></Pressable>
            <Pressable onPress={() => add(m, 1)} hitSlop={8}><T w="x" style={{ fontSize: 22, paddingHorizontal: 8 }}>+</T></Pressable>
            <T w="b" style={{ minWidth: 70, textAlign: "left" }}>{money(cart[m.item_id] * m.price)}</T>
          </View>
        ))}
      </Card>

      <Card>
        <T w="b">التوصيل على</T>
        {!session ? <Btn kind="sec" title="سجّل دخول بموبايلك" onPress={() => router.push("/login")} /> : (
          <>
            {addrs.map((a) => (
              <Pressable key={a.id} onPress={() => setAddr(a.id)} style={{ borderWidth: 2, borderColor: chosen?.id === a.id ? C.y : C.line, borderRadius: 14, padding: 10 }}>
                <T w="b">{a.label}</T><T style={{ color: C.muted }}>{[a.area, a.address].filter(Boolean).join(" — ")}</T>
              </Pressable>
            ))}
            <Btn kind="sec" title="+ عنوان جديد" onPress={() => router.push({ pathname: "/address", params: { loc: branch ?? "" } })} />
          </>
        )}
      </Card>

      <Card>
        <T w="b">الدفع</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{PAY.map(([k, l]) => <Chip key={k} label={l} on={pay === k} onPress={() => setPay(k)} />)}</View>
        <Input placeholder="ملاحظة (مثلًا: تقطيع معيّن)" value={note} onChangeText={setNote} />
      </Card>

      <Card>
        <Row l="الأصناف (تقريبي)" v={money(sub)} />
        <Row l="التوصيل" v={money(br?.fee ?? 0)} />
        <Row l="الإجمالي التقريبي" v={money(sub + (br?.fee ?? 0))} big />
        {!!config?.note && <T style={{ color: C.muted, fontSize: 13 }}>{config.note}</T>}
        {br && sub < br.min_order && <T style={{ color: C.bad }}>أقل طلب {money(br.min_order)}</T>}
      </Card>
      <Err t={err} />
      <Btn title="أكّد الطلب" onPress={place} busy={busy} disabled={!br?.open || (br && sub < br.min_order)} />
    </ScrollView>
  );
}
const Row = ({ l, v, big }: { l: string; v: string; big?: boolean }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T w={big ? "x" : "r"} style={big ? { fontSize: 18 } : undefined}>{l}</T><T w={big ? "x" : "b"} style={big ? { fontSize: 18 } : undefined}>{v}</T></View>
);
