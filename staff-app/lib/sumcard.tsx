import { View } from "react-native";
import { T } from "./ui";
import { C } from "./theme";

export type Sum = { req_days: number; req_hours: number; due_days: number; due_hours: number; present: number; absent: number; worked_hours: number; short_hours: number; left_days: number; left_hours: number;
  late: number; late_min: number; early: number; early_min: number; ot_hours: number; leave_days: number; holidays: number; gift: number; rest_work: number; permits: number; open_day: boolean };

const Box = ({ k, v, c }: { k: string; v: string | number; c?: string }) => (
  <View style={{ width: "31%", backgroundColor: C.off, borderRadius: 12, padding: 8 }}><T style={{ color: C.mid, fontSize: 11.5 }}>{k}</T><T b style={{ fontSize: 16, color: c ?? C.black }}>{String(v)}</T></View>
);

/** إجماليات الشهر — نفس الكارت للموظف ولمديره */
export function SumGrid({ s, compact }: { s: Sum; compact?: boolean }) {
  const pct = s.due_hours ? Math.min(100, Math.round((s.worked_hours / s.due_hours) * 100)) : 0;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ height: 10, backgroundColor: C.off, borderRadius: 5, overflow: "hidden" }}><View style={{ width: `${pct}%`, height: 10, backgroundColor: pct >= 95 ? C.green : C.y }} /></View>
      <T style={{ color: C.mid, fontSize: 12.5 }}>اشتغلت {s.worked_hours} ساعة من {s.due_hours} مطلوبين لحد النهارده{s.open_day ? " (النهارده لسه شغال)" : ""}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Box k="أيام حضور" v={`${s.present}/${s.due_days}`} />
        <Box k="غياب" v={s.absent} c={s.absent ? C.red : undefined} />
        <Box k="ناقص ساعات" v={s.short_hours} c={s.short_hours ? C.red : undefined} />
        {!compact && <Box k="إضافي (ساعة)" v={s.ot_hours} c={s.ot_hours ? C.green : undefined} />}
        {!compact && <Box k="تأخير" v={s.late ? `${s.late} (${s.late_min}د)` : "0"} />}
        {!compact && <Box k="انصراف بدري" v={s.early ? `${s.early} (${s.early_min}د)` : "0"} />}
        {!compact && <Box k="إجازات" v={s.leave_days + s.gift} />}
        {!compact && <Box k="أذون" v={s.permits} />}
        <Box k="فاضل في الشهر" v={`${s.left_days} يوم`} />
        {!compact && <Box k="فاضل ساعات" v={s.left_hours} />}
      </View>
    </View>
  );
}
