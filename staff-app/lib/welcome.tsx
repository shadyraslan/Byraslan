import { useEffect, useState } from "react";
import { Modal, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sb } from "./supabase";
import { Btn, T } from "./ui";
import { C } from "./theme";

type W = { on: boolean; ver: number; title: string; body: string };
/** رسالة الترحيب للموظف: مرة واحدة لكل نسخة (بتتغيّر من شاشة الإشعارات في السيستم) */
export function Welcome() {
  const [w, setW] = useState<W | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    sb.rpc("staff_welcome").then(async ({ data }) => {
      const x = data as W | null;
      if (!x?.on) return;
      setW(x);
      const v = Number((await AsyncStorage.getItem("welcomeVer").catch(() => null)) ?? 0);
      if (v < (x.ver ?? 1)) setShow(true);
    });
  }, []);
  const close = () => { setShow(false); AsyncStorage.setItem("welcomeVer", String(w?.ver ?? 1)).catch(() => {}); };
  if (!w) return null;
  return (
    <Modal visible={show} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,.55)", justifyContent: "center", padding: 26 }}>
        <View style={{ backgroundColor: C.white, borderRadius: 24, padding: 24, gap: 12 }}>
          <View style={{ alignSelf: "center", width: 70, height: 70, borderRadius: 20, backgroundColor: C.y, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 34 }}>👋</Text></View>
          <T b style={{ fontSize: 20, textAlign: "center" }}>{w.title}</T>
          <T style={{ color: "#555", textAlign: "center", lineHeight: 24 }}>{w.body}</T>
          <Btn y title="يلا بينا" onPress={close} />
        </View>
      </View>
    </Modal>
  );
}
