import { ActivityIndicator, Pressable, Text, TextInput, View, type TextInputProps, type TextProps, type ViewStyle, type StyleProp } from "react-native";
import { C, F } from "./theme";

export const T = ({ style, w = "r", ...p }: TextProps & { w?: keyof typeof F }) => (
  <Text {...p} style={[{ fontFamily: F[w], color: C.ink, fontSize: 15, textAlign: "right", writingDirection: "rtl" }, style]} />
);

export function Btn({ title, onPress, kind = "pri", disabled, busy, style }: { title: string; onPress?: () => void; kind?: "pri" | "sec" | "dark"; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle> }) {
  const bg = kind === "pri" ? C.y : kind === "dark" ? C.black : C.panel;
  const fg = kind === "dark" ? "#fff" : C.ink;
  return (
    <Pressable onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [{ backgroundColor: bg, borderRadius: 14, height: 50, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, borderWidth: kind === "sec" ? 1 : 0, borderColor: C.line, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <T w="b" style={{ color: fg, fontSize: 16 }}>{title}</T>}
    </Pressable>
  );
}

export const Input = (p: TextInputProps) => (
  <TextInput placeholderTextColor={C.muted} {...p}
    style={[{ backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, fontFamily: F.r, fontSize: 16, color: C.ink, textAlign: p.style ? undefined : "right" }, p.style]} />
);

export const Card = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ backgroundColor: C.panel, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, gap: 8 }, style]}>{children}</View>
);

export const Err = ({ t }: { t: string | null }) => (t ? <T style={{ color: C.bad, backgroundColor: "#FDECEC", padding: 10, borderRadius: 12 }} w="m">{t}</T> : null);

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 16, height: 38, borderRadius: 19, justifyContent: "center", backgroundColor: on ? C.black : C.panel, borderWidth: 1, borderColor: on ? C.black : C.line }}>
      <T w="b" style={{ color: on ? C.y : C.ink, fontSize: 14 }}>{label}</T>
    </Pressable>
  );
}
