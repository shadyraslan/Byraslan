import { useCallback, useMemo, useState } from "react";
import { Dimensions, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sb } from "@/lib/supabase";
import { Welcome } from "@/lib/welcome";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/lib/store";
import { Art, BlackHead, Chip, Fav, Grid, IconBtn, LocBar, Qty, SearchBar, SecHead, T } from "@/lib/ui";
import { C, money } from "@/lib/theme";
import type { MenuItem } from "@/lib/types";

const W = Dimensions.get("window").width;

/** كارت أفقي (الأكثر طلباً / جديد عندنا) */
function HCard({ m }: { m: MenuItem }) {
  return (
    <Pressable onPress={() => router.push(`/product/${m.item_id}`)} style={{ width: 150, backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: "hidden", opacity: m.available > 0 ? 1 : 0.5 }}>
      <View><Art m={m} h={112} size={50} /><Fav id={m.item_id} /></View>
      <View style={{ padding: 10, gap: 1 }}>
        <T w="b" style={{ fontSize: 10, color: C.mid }}>{m.family}</T>
        <T w="x" style={{ fontSize: 12.5 }} numberOfLines={1}>{m.name}</T>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <T w="x" style={{ fontSize: 14 }}>{money(m.price)}</T>
          <Qty m={m} />
        </View>
      </View>
    </Pressable>
  );
}

export default function Home() {
  const ins = useSafeAreaInsets();
  const { config, district, menu, loadMenu, cart, profile } = useApp();
  // نقطة حمرا على الجرس لو فيه إشعار جديد
  const [unread, setUnread] = useState(false);
  useFocusEffect(useCallback(() => {
    sb.rpc("app_inbox", { p_phone: profile.phone || null, p_district: district?.id ?? null }).then(async ({ data }) => {
      const top = ((data ?? []) as { id: number }[])[0]?.id ?? 0;
      const seen = Number((await AsyncStorage.getItem("noticeSeen").catch(() => null)) ?? 0);
      setUnread(top > seen);
    });
  }, [profile.phone, district?.id]));
  const [fam, setFam] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const fams = useMemo(() => [...new Set((menu ?? []).map((m) => m.family ?? "أصناف"))], [menu]);
  const shown = (menu ?? []).filter((m) => !fam || (m.family ?? "أصناف") === fam);
  const best = (menu ?? []).filter((m) => m.available > 0).slice(0, 8);
  const offers = (menu ?? []).filter((m) => m.pct > 0);
  const n = Object.keys(cart).length;
  const banners = config?.banners ?? [];
  const bw = W - 36;

  return (
    <View style={{ flex: 1 }}>
      <Welcome />
      <BlackHead back={false}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <IconBtn name="menu" onPress={() => router.push("/account")} />
            <IconBtn name="notifications-outline" dot={unread} onPress={() => router.push("/notices")} />
          </View>
          <Pressable onPress={() => router.push("/cart")} style={{ backgroundColor: C.y, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, flexDirection: "row", gap: 6, alignItems: "center" }}>
            <Ionicons name="cart" size={15} color={C.black} />
            <T w="x" style={{ fontSize: 13 }}>السلة</T>
            <View style={{ backgroundColor: C.black, borderRadius: 10, paddingHorizontal: 6 }}><T w="b" style={{ color: C.white, fontSize: 11 }}>{n}</T></View>
          </Pressable>
        </View>
        <LocBar />
        <SearchBar />
      </BlackHead>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 + ins.bottom }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadMenu(); setRefreshing(false); }} />}>
        {!district && (
          <View style={{ margin: 18, backgroundColor: C.white, borderRadius: 18, padding: 18, gap: 12 }}>
            <T w="x" style={{ fontSize: 17 }}>ساكن فين؟ 📍</T>
            <T style={{ color: C.muted }}>اختار منطقتك عشان نوريك المتاح في أقرب فرع ليك وسعر التوصيل.</T>
            <Pressable onPress={() => router.push("/loc")} style={{ backgroundColor: C.y, borderRadius: 14, height: 48, alignItems: "center", justifyContent: "center" }}><T w="x">اختار منطقتك</T></Pressable>
          </View>
        )}
        {district && !district.branch && (
          <View style={{ margin: 18, backgroundColor: "#FFF3CD", borderRadius: 14, padding: 14 }}><T w="b" style={{ color: "#7A5B00" }}>منطقة {district.name} لسه مش متغطية — قريب إن شاء الله. جرّب منطقة تانية.</T></View>
        )}
        {config && !config.open && <View style={{ marginHorizontal: 18, marginTop: 14, backgroundColor: "#FFF3CD", borderRadius: 14, padding: 12 }}><T w="b" style={{ color: "#7A5B00" }}>الطلبات مقفولة دلوقتي</T></View>}

        {!!fams.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 18, paddingTop: 14 }}>
            <Chip label="الكل" on={!fam} onPress={() => setFam(null)} />
            {fams.map((f) => <Chip key={f} label={f} on={fam === f} onPress={() => setFam(f)} />)}
          </ScrollView>
        )}

        {!fam && (config?.campaigns ?? []).map((c) => (
          <Pressable key={c.id} onPress={() => router.push("/offers")} style={{ marginHorizontal: 18, marginTop: 14, backgroundColor: c.color, borderRadius: 18, padding: 16 }}>
            <T w="x" style={{ color: "#fff", fontSize: 18 }}>🔥 {c.name}</T>
            {!!c.subtitle && <T style={{ color: "#fff" }}>{c.subtitle}</T>}
            <T style={{ color: "#fff", fontSize: 12 }}>لحد {new Date(c.ends_at).toLocaleDateString("ar-EG", { day: "numeric", month: "long" })} — شوف العروض ←</T>
          </Pressable>
        ))}
        {!fam && !!banners.length && (
          <View style={{ paddingTop: 14 }}>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} snapToInterval={bw + 12} decelerationRate="fast" contentContainerStyle={{ paddingHorizontal: 18, gap: 12 }}
              onMomentumScrollEnd={(e) => setSlide(Math.round(Math.abs(e.nativeEvent.contentOffset.x) / (bw + 12)))}>
              {banners.map((b, i) => (
                <Pressable key={i} onPress={() => (b.family ? router.push({ pathname: "/cat/[name]", params: { name: b.family } }) : router.push("/offers"))}
                  style={{ width: bw, height: 160, borderRadius: 22, backgroundColor: b.bg || "#1A1A1A", padding: 18, overflow: "hidden", justifyContent: "center", gap: 6 }}>
                  <Text style={{ position: "absolute", left: 10, bottom: -6, fontSize: 92, opacity: 0.9 }}>{b.icon}</Text>
                  {b.badge ? <View style={{ alignSelf: "flex-start", backgroundColor: C.y, borderRadius: 12, paddingHorizontal: 10 }}><T w="x" style={{ fontSize: 11 }}>{b.badge}</T></View> : null}
                  <T w="x" style={{ color: C.white, fontSize: 21, lineHeight: 30, maxWidth: "62%" }}>{b.title}</T>
                  {b.subtitle ? <T style={{ color: "#AAA", fontSize: 12 }}>{b.subtitle}</T> : null}
                  {b.cta ? <View style={{ alignSelf: "flex-start", backgroundColor: C.y, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 5, marginTop: 4 }}><T w="x" style={{ fontSize: 12.5 }}>{b.cta}</T></View> : null}
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 5, justifyContent: "center", marginTop: 10 }}>
              {banners.map((_, i) => <View key={i} style={{ width: i === slide ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === slide ? C.black : "#CCC" }} />)}
            </View>
          </View>
        )}

        {district?.branch && (
          <View style={{ paddingHorizontal: 18, paddingTop: 14, gap: 18 }}>
            {!fam && (
              <Pressable onPress={() => router.push("/cats")} style={{ backgroundColor: C.black, borderRadius: 14, height: 50, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="grid-outline" size={17} color={C.white} />
                <T w="x" style={{ color: C.white }}>تصفّح كل الأقسام</T>
              </Pressable>
            )}

            {!fam && !!best.length && (
              <View>
                <SecHead title="الأكثر طلباً" more="عرض الكل" onMore={() => setFam(fams[0] ?? null)} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>{best.map((m) => <HCard key={m.item_id} m={m} />)}</ScrollView>
              </View>
            )}

            {!fam && config?.first_free && (
              <View style={{ backgroundColor: C.black, borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <T w="x" style={{ color: C.y, fontSize: 14 }}>⚡ توصيل مجاني</T>
                  <T style={{ color: "#999", fontSize: 11.5 }}>على أول طلب ليك</T>
                </View>
                <Pressable onPress={() => router.push("/offers")} style={{ backgroundColor: C.y, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 7 }}><T w="x" style={{ fontSize: 12.5 }}>اكتشف</T></Pressable>
              </View>
            )}

            {!fam && !!offers.length && (
              <View>
                <SecHead title="العروض 🔥" more="عرض الكل" onMore={() => router.push("/offers")} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>{offers.map((m) => <HCard key={m.item_id} m={m} />)}</ScrollView>
              </View>
            )}

            <View>
              <SecHead title={fam ?? "جديد عندنا"} more={fam ? undefined : `${shown.length} منتج`} />
              {menu === null ? <T style={{ color: C.mid }}>بيحمّل…</T> : shown.length ? <Grid items={shown} /> : <T style={{ color: C.mid }}>مفيش منتجات متاحة في فرعك دلوقتي</T>}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
