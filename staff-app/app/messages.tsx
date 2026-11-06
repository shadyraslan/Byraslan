import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sb } from "@/lib/supabase";
import { Badge, Btn, Card, Head, T } from "@/lib/ui";
import { C, day, hhmm } from "@/lib/theme";

type Msg = { id: number; title: string; body: string; needs_ack: boolean; at: string; read?: { read_at: string; ack_at: string | null } };

export default function Messages() {
  const ins = useSafeAreaInsets();
  const [list, setList] = useState<Msg[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(async () => {
    const { data: u } = await sb.auth.getUser();
    const [{ data: m }, { data: r }] = await Promise.all([
      sb.from("staff_messages").select("id,title,body,needs_ack,at").order("id", { ascending: false }).limit(50),
      sb.from("staff_message_reads").select("message_id,read_at,ack_at").eq("user_id", u.user?.id ?? ""),
    ]);
    const R = new Map((r ?? []).map((x) => [Number(x.message_id), x as { read_at: string; ack_at: string | null }]));
    setList(((m ?? []) as Msg[]).map((x) => ({ ...x, read: R.get(Number(x.id)) })));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const openMsg = async (x: Msg) => {
    setOpen(open === x.id ? null : x.id);
    if (!x.read) { await sb.from("staff_message_reads").insert({ message_id: x.id }); load(); }
  };
  const ack = async (x: Msg) => { await sb.from("staff_message_reads").update({ ack_at: new Date().toISOString() }).eq("message_id", x.id); load(); };
  return (
    <View style={{ flex: 1 }}>
      <Head title="رسايل الإدارة" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 40 + ins.bottom }}>
        {list.map((x) => (
          <Pressable key={x.id} onPress={() => openMsg(x)}>
            <Card style={!x.read ? { borderColor: C.y, borderWidth: 2 } : undefined}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T b style={{ flex: 1 }}>{x.title}</T>
                {!x.read ? <Badge kind="y" t="جديدة" /> : x.needs_ack && !x.read.ack_at ? <Badge kind="wait" t="محتاجة موافقتك" /> : null}
              </View>
              <T style={{ color: C.mid, fontSize: 12 }}>{day(x.at)} · {hhmm(x.at)}</T>
              {open === x.id && <T style={{ lineHeight: 26 }}>{x.body}</T>}
              {open === x.id && x.needs_ack && (x.read?.ack_at ? <Badge kind="ok" t="وافقت عليها" /> : <Btn y title="قريت وموافق" onPress={() => ack(x)} />)}
            </Card>
          </Pressable>
        ))}
        {!list.length && <T style={{ color: C.mid }}>مفيش رسايل</T>}
      </ScrollView>
    </View>
  );
}
