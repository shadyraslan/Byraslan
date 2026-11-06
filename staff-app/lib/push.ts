import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { sb } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** تسجيل موبايل الموظف للإشعارات — بيشتغل بس لما التطبيق يتبني بحساب Expo (projectId) */
export async function registerPush() {
  try {
    if (!Device.isDevice) return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("default", { name: "رسايل الإدارة", importance: Notifications.AndroidImportance.HIGH });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await sb.rpc("register_push", { p_app: "staff", p_token: data, p_platform: Platform.OS, p_phone: null, p_district: null });
  } catch {}
}
