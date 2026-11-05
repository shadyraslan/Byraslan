/** رقم العلبة من الـ QR: "R1234" أو "1234" أو "R1234|..." */
export function boxSn(raw: string): number | null {
  const v = String(raw || "").trim();
  if (!/^R?\d{3,9}(\|.*)?$/i.test(v)) return null;
  const n = parseInt(v.replace(/^R/i, "").split("|")[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** كود الصندوق البلاستيك: "CR-001" أو "CR1" */
export function crateId(raw: string): string | null {
  const m = String(raw || "").trim().toUpperCase().match(/^CR-?(\d{1,4})$/);
  return m ? "CR-" + m[1].padStart(3, "0") : null;
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/** رسالة الخطأ اللي جاية من الداتابيز من غير الكلام الإنجليزي */
export const dbMsg = (m: string | undefined) => (m || "حصل خطأ").replace(/^.*?ERROR:\s*/, "").trim();
