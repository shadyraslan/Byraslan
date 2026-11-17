"use client";
// زرارين (أو أكتر) جوه نفس الفورم بيبعتوا قيمة مختلفة — من غير الاعتماد على قيمة الزرار نفسه
// (بعض المتصفحات القديمة مش بتبعت قيمة الزرار اللي اتداس، فكان "وافق" بيوصل كأنه "ارفض").
import type { CSSProperties } from "react";
type Opt = { v: string; label: string; pri?: boolean };
export default function Choice({ name, opts, style }: { name: string; opts: Opt[]; style?: CSSProperties }) {
  return (
    <>
      <input type="hidden" name={name} defaultValue="" />
      {opts.map((o) => (
        <button key={o.v} type="submit" className={o.pri ? "btn pri" : "btn"} style={style}
          onClick={(e) => { const f = e.currentTarget.form; const el = f?.elements.namedItem(name) as HTMLInputElement | null; if (el) el.value = o.v; }}>
          {o.label}
        </button>
      ))}
    </>
  );
}
