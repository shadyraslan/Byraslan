"use client";
import { useEffect, useRef } from "react";

/**
 * خانة مسح: أول ما الماسح يقرا الباركود/QR بيتسجّل لوحده — من غير Enter ولا زرار.
 * الماسح بيكتب بسرعة جدًا (< 45ms بين كل حرف)؛ لو ماباعتش Enter بنسجّل بعد 90ms سكوت.
 * لو بعت Enter بنسجّل مرة واحدة بس. الكتابة باليد: اكتب الرقم (مع # أو من غيرها) ودوس Enter أو زرار ✓.
 */
export default function ScanInput({ onScan, placeholder, autoFocus = true }: { onScan: (code: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const st = useRef({ n: 0, fast: 0, last: 0, t: 0 as unknown as ReturnType<typeof setTimeout> });

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const fire = () => {
    const el = ref.current;
    if (!el) return;
    const v = el.value.trim();
    clearTimeout(st.current.t);
    st.current = { n: 0, fast: 0, last: 0, t: st.current.t };
    if (!v) return;
    el.value = "";
    onScan(v);
    el.focus();
  };

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
    <input
      ref={ref}
      className="scan"
      dir="ltr"
      autoComplete="off"
      placeholder={placeholder ?? "امسح…"}
      onInput={() => {
        const s = st.current;
        const now = performance.now();
        if (now - s.last > 120) { s.n = 0; s.fast = 0; }
        if (s.n > 0 && now - s.last < 45) s.fast++;
        s.n++;
        s.last = now;
        clearTimeout(s.t);
        if (s.n >= 4 && s.fast >= s.n - 2) s.t = setTimeout(fire, 90);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); fire(); }
      }}
    />
    <button type="button" className="btn" title="لو بتكتب الرقم بإيدك" onClick={fire} style={{ height: 52, minWidth: 64, fontWeight: 800 }}>✓</button>
    </div>
  );
}
