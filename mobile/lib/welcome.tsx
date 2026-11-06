import { useEffect, useState } from "react";
import { Modal, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useApp } from "./store";
import { Btn, T } from "./ui";
import { C } from "./theme";

/** رسالة الترحيب: بتظهر مرة واحدة لكل نسخة (الإدارة بتغيّرها من شاشة الإشعارات في السيستم) */
export function Welcome() {
  const { config } = useApp();
  const w = config?.welcome;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!w?.on) return;
    AsyncStorage.getItem("welcomeVer").then((v) => { if (Number(v ?? 0) < (w.ver ?? 1)) setShow(true); }).catch(() => {});
  }, [w?.on, w?.ver]);
  const close = () => { setShow(false); AsyncStorage.setItem("welcomeVer", String(w?.ver ?? 1)).catch(() => {}); };
  if (!w) return null;
  return (
    <Modal visible={show} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,.55)", justifyContent: "center", padding: 26 }}>
        <View style={{ backgroundColor: C.white, borderRadius: 24, padding: 24, gap: 12 }}>
          <View style={{ alignSelf: "center", width: 70, height: 70, borderRadius: 20, backgroundColor: C.y, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 34 }}>👋</Text></View>
          <T w="x" style={{ fontSize: 20, textAlign: "center" }}>{w.title}</T>
          <T style={{ color: "#555", textAlign: "center", lineHeight: 24 }}>{w.body}</T>
          <Btn y title="يلا نبدأ" onPress={close} />
        </View>
      </View>
    </Modal>
  );
}
