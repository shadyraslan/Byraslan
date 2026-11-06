import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/lib/store";
import { CartBar, Grid, Pill, ProductCard, T } from "@/lib/ui";
import { C } from "@/lib/theme";

export default function Home() {
  const ins = useSafeAreaInsets();
  const { config, district, menu, loadMenu, cart, me } = useApp();
  const [brand, setBrand] = useState<string | null>(null);
  const [fam, setFam] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const brands = useMemo(() => [...new Set((menu ?? []).map((m) => m.brand))], [menu]);
  const curB = brand && brands.includes(brand) ? brand : null;
  const inBrand = (menu ?? []).filter((m) => !curB || m.brand === curB);
  const fams = [...new Set(inBrand.map((m) => m.family ?? "أصناف"))];
  const shown = inBrand.filter((m) => !fam || (m.family ?? "أصناف") === fam);
  const n = Object.keys(cart).length;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 170 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadMenu(); setRefreshing(false); }} />}>
        {/* الهيدر الأسود */}
        <View style={{ backgroundColor: C.ink, paddingTop: ins.top + 10, paddingHorizontal: 14, paddingBottom: 16, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <T w="x" style={{ color: "#fff", fontSize: 18 }}>{me?.name ? `أهلاً ${me.name.split(" ")[0]} 👋` : "باي رسلان"}</T>
              <T style={{ color: "#888", fontSize: 11 }}>روستوز ورسلان ماركت في سلة واحدة</T>
            </View>
            <Pressable onPress={() => router.push("/cart")} style={{ backgroundColor: C.y, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Ionicons name="cart" size={16} color={C.ink} />
              <T w="x" style={{ fontSize: 13 }}>السلة</T>
              <View style={{ backgroundColor: C.ink, borderRadius: 10, paddingHorizontal: 6 }}><T w="b" style={{ color: "#fff", fontSize: 11 }}>{n}</T></View>
            </Pressable>
          </View>
          <Pressable onPress={() => router.push("/loc")} style={{ backgroundColor: C.dark2, borderWidth: 1, borderColor: C.dark3, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <T style={{ color: "#888", fontSize: 10.5 }}>التوصيل إلى</T>
              <T w="x" style={{ color: "#fff", fontSize: 13 }}>{district ? `${district.name}${district.branch_name ? ` · فرع ${district.branch_name}` : ""}` : "اختار منطقتك"}</T>
            </View>
            <T w="b" style={{ color: C.y, fontSize: 11.5 }}>{district ? "تغيير" : "اختار"}</T>
          </Pressable>
          <Pressable onPress={() => router.push("/search")} style={{ backgroundColor: C.dark2, borderWidth: 1, borderColor: C.dark3, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Ionicons name="search" size={16} color="#777" />
            <T style={{ color: "#777", fontSize: 12.5 }}>دوّر على منتج…</T>
          </Pressable>
        </View>

        {!district && (
          <View style={{ margin: 14, backgroundColor: C.panel, borderRadius: 16, padding: 16, gap: 10 }}>
            <T w="x" style={{ fontSize: 16 }}>ساكن فين؟</T>
            <T style={{ color: C.muted }}>اختار منطقتك عشان نوريك المتاح في أقرب فرع ليك وسعر التوصيل.</T>
            <Pressable onPress={() => router.push("/loc")} style={{ backgroundColor: C.y, borderRadius: 12, padding: 12, alignItems: "center" }}><T w="x">اختار منطقتك</T></Pressable>
          </View>
        )}
        {district && !district.branch && (
          <View style={{ margin: 14, backgroundColor: "#FFF3CD", borderRadius: 12, padding: 12 }}>
            <T w="b" style={{ color: "#7A5B00" }}>منطقة {district.name} لسه مش متغطية — قريب إن شاء الله. جرّب منطقة تانية.</T>
          </View>
        )}
        {config && !config.open && <View style={{ marginHorizontal: 14, marginTop: 12, backgroundColor: "#FFF3CD", borderRadius: 12, padding: 10 }}><T w="b" style={{ color: "#7A5B00" }}>الطلبات مقفولة دلوقتي</T></View>}

        {district?.branch && (
          <>
            {brands.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingTop: 12 }}>
                <Pill label="الكل" on={!curB} onPress={() => { setBrand(null); setFam(null); }} />
                {brands.map((b) => <Pill key={b} label={config?.brands[b] ?? b} on={curB === b} onPress={() => { setBrand(b); setFam(null); }} />)}
              </ScrollView>
            )}
            {fams.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingTop: 10 }}>
                {fams.map((f) => <Pill key={f} label={f} on={fam === f} onPress={() => setFam(fam === f ? null : f)} />)}
              </ScrollView>
            )}
            <Pressable onPress={() => router.push("/cats")} style={{ marginHorizontal: 14, marginTop: 12, backgroundColor: C.ink, borderRadius: 14, padding: 12, alignItems: "center" }}>
              <T w="x" style={{ color: "#fff" }}>تصفّح كل الأقسام</T>
            </Pressable>

            {!fam && inBrand.length > 4 && (
              <View style={{ paddingTop: 14 }}>
                <View style={{ paddingHorizontal: 14, marginBottom: 8, flexDirection: "row", justifyContent: "space-between" }}><T w="x" style={{ fontSize: 16 }}>الأكثر طلباً</T></View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 14 }}>
                  {inBrand.filter((m) => m.available > 0).slice(0, 8).map((m) => <ProductCard key={m.item_id} m={m} width={150} />)}
                </ScrollView>
              </View>
            )}

            <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
              <T w="x" style={{ fontSize: 16, marginBottom: 8 }}>{fam ?? "كل المنتجات"}</T>
              {menu === null ? <T style={{ color: C.g }}>بيحمّل…</T> : shown.length ? <Grid items={shown} /> : <T style={{ color: C.g }}>مفيش منتجات متاحة في فرعك دلوقتي</T>}
            </View>
          </>
        )}
      </ScrollView>
      <CartBar bottom={88 + ins.bottom} />
    </View>
  );
}
