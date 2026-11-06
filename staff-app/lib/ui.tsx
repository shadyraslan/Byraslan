import { ActivityIndicator, Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type TextProps, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { C } from "./theme";

export const T = ({ style, b, ...p }: TextProps & { b?: boolean }) => (
  <Text {...p} style={[{ color: C.black, fontSize: 15, fontWeight: b ? "800" : "400", textAlign: "right", writingDirection: "rtl" }, style]} />
);
export function Btn({ title, onPress, y, outline, disabled, busy, style, danger }: { title: string; onPress?: () => void; y?: boolean; outline?: boolean; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>; danger?: boolean }) {
  const bg = danger ? C.red : y ? C.y : outline ? C.white : C.black;
  const fg = y || outline ? C.black : C.white;
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} style={({ pressed }) => [{ backgroundColor: bg, borderRadius: 14, height: 52, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderWidth: outline ? 1.5 : 0, borderColor: C.border, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <T b style={{ color: fg, fontSize: 16, textAlign: "center" }}>{title}</T>}
    </Pressable>
  );
}
export const Input = (p: TextInputProps) => (
  <TextInput placeholderTextColor={C.mid} {...p} style={[{ backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, minHeight: 50, paddingHorizontal: 14, fontSize: 16, color: C.black, textAlign: "right" }, p.style]} />
);
export const Card = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 10 }, style]}>{children}</View>
);
export function Head({ title, sub, back = true, right }: { title: string; sub?: string; back?: boolean; right?: React.ReactNode }) {
  const ins = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: C.black, paddingTop: ins.top + 10, paddingBottom: 16, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 10 }}>
      {back && router.canGoBack() && <Pressable onPress={() => router.back()} style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,.1)", alignItems: "center", justifyContent: "center" }}><Ionicons name="chevron-forward" size={20} color={C.white} /></Pressable>}
      <View style={{ flex: 1 }}>
        <T b style={{ color: C.white, fontSize: 18 }}>{title}</T>
        {sub ? <T style={{ color: "#999", fontSize: 12.5 }}>{sub}</T> : null}
      </View>
      {right}
    </View>
  );
}
export const Err = ({ t }: { t: string | null }) => (t ? <T b style={{ color: C.red, backgroundColor: C.redSoft, padding: 12, borderRadius: 12 }}>{t}</T> : null);
export const Ok = ({ t }: { t: string | null }) => (t ? <T b style={{ color: C.green, backgroundColor: C.greenSoft, padding: 12, borderRadius: 12 }}>{t}</T> : null);
export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: "center", backgroundColor: on ? C.black : C.white, borderWidth: 1.5, borderColor: on ? C.black : C.border }}>
      <T b style={{ fontSize: 13.5, color: on ? C.white : "#555" }}>{label}</T>
    </Pressable>
  );
}
export const Badge = ({ t, kind }: { t: string; kind: "ok" | "wait" | "bad" | "y" }) => {
  const [bg, fg] = kind === "ok" ? [C.greenSoft, C.green] : kind === "bad" ? [C.redSoft, C.red] : kind === "wait" ? [C.amberSoft, C.amber] : [C.y, C.black];
  return <View style={{ backgroundColor: bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2, alignSelf: "flex-start" }}><T b style={{ color: fg, fontSize: 12 }}>{t}</T></View>;
};
