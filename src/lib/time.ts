/** أول النهارده بتوقيت القاهرة (بيحسب التوقيت الصيفي لوحده) */
export function cairoDayStart(d = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(d);
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", timeZoneName: "longOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "GMT+02:00";
  const o = off.replace("GMT", "") || "+00:00";
  return `${day}T00:00:00${o}`;
}
export const cairoDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(d);
export const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
