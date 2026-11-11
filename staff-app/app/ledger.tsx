import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errMsg, sb } from "@/lib/supabase";
import { Card, Err, Head, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";

type Ln = { at: string; kind: string; ref: string; detail: string | null; who: string | null; loc: string | null; lah: number; alayh: number; info: boolean; bal: number };
type R = { opening: number; closing: number; lines: Ln[] };

/** كشف حسابي: السلف والعهدة والمشتريات الآجل واللي اتخصم — والرصيد بعد كل حركة */
export default function Ledger() {
  const ins = useSafeAreaInsets();
  const [r, setR] = useState<R | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const t = new Date(); const from = `${t.getFullYear() - 1}-01-01`; const to = t.toISOString().slice(0, 10);
    const { data, error } = await sb.rpc("my_ledger", { p_from: from, p_to: to });
    if (error) setErr(errMsg(error)); else setR(data as R);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const bal = (n: number) => (Math.abs(n) < 0.005 ? "مفيش" : n < 0 ? `عليك ${money(-n)}` : `ليك ${money(n)}`);
  const L = [...(r?.lines ?? [])].reverse();
  return (
    <View style={{ flex: 1, backgroundColor: C.off }}>
      <Head title="كشف حسابي" sub="سلف، عهدة، مشتريات، مرتبات" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 40 + ins.bottom }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <Err t={err} />
        {r && <Card><T style={{ color: C.mid }}>الرصيد دلوقتي</T><T b style={{ fontSize: 24, color: r.closing < 0 ? C.red : C.green }}>{bal(Number(r.closing))}</T></Card>}
        {L.map((l, i) => (
          <Card key={i} style={{ opacity: l.info ? 0.8 : 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T b style={{ flex: 1 }}>{l.kind}</T>
              {!l.info && <T b style={{ color: Number(l.alayh) > 0 ? C.red : C.green }}>{Number(l.alayh) > 0 ? `− ${money(Number(l.alayh))}` : `+ ${money(Number(l.lah))}`}</T>}
            </View>
            {!!l.detail && <T style={{ fontSize: 13 }}>{l.detail}</T>}
            <T style={{ color: C.mid, fontSize: 12 }}>{new Date(l.at).toLocaleDateString("ar-EG")}{l.who ? ` · ${l.who}` : ""}{l.loc ? ` · ${l.loc}` : ""} · {l.info ? "للعلم" : `الرصيد: ${bal(Number(l.bal))}`}</T>
          </Card>
        ))}
        {r && !L.length && <Card><T style={{ color: C.mid, textAlign: "center" }}>مفيش حركات</T></Card>}
      </ScrollView>
    </View>
  );
}
