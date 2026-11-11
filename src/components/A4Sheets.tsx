import type { ReactNode } from "react";

/** كام ملصق في ورقة A4 (هامش 6مم) لكل شكل — المقاسات بالمللي */
export const SHEET = {
  offer: { cols: 2, rows: 8, w: 96, h: 32, gx: 3, gy: 3, label: "ملصق عرض 96×32" },
  shelf: { cols: 2, rows: 7, w: 70, h: 38, gx: 4, gy: 2.5, label: "ملصق رف 70×38" },
  sticker: { cols: 4, rows: 10, w: 40, h: 26, gx: 3, gy: 2.5, label: "ملصق منتج 40×26" },
} as const;
export type SheetKind = keyof typeof SHEET;
export const perPage = (k: SheetKind) => SHEET[k].cols * SHEET[k].rows;
export const pagesFor = (k: SheetKind, n: number) => Math.max(1, Math.ceil(n / perPage(k)));

/** يكمّل آخر ورقة بتكرار نفس الأصناف بالدور عشان الورقة ماتتهدرش */
export function fillPage<T>(list: T[], k: SheetKind): T[] {
  if (!list.length) return list;
  const target = pagesFor(k, list.length) * perPage(k);
  return Array.from({ length: target }, (_, i) => list[i < list.length ? i : (i - list.length) % list.length]);
}

/** صفحات A4: كل صفحة شبكة ثابتة، أصناف كتير في نفس الورقة، وخطوط قص خفيفة */
export function A4Sheets({ kind, cells }: { kind: SheetKind; cells: ReactNode[] }) {
  const s = SHEET[kind], per = perPage(kind);
  const pages = Array.from({ length: Math.ceil(cells.length / per) }, (_, p) => cells.slice(p * per, p * per + per));
  return (
    <div className="a4wrap">
      <style>{`
        .a4wrap{display:grid;gap:8mm;justify-content:center}
        .a4{box-sizing:border-box;width:198mm;height:285mm;background:#fff;display:grid;grid-template-columns:repeat(${s.cols},${s.w}mm);grid-auto-rows:${s.h}mm;column-gap:${s.gx}mm;row-gap:${s.gy}mm;justify-content:center;align-content:start;padding-top:1mm;box-shadow:0 0 0 1px #ddd,0 2px 10px rgba(0,0,0,.08)}
        .a4>*{outline:.15mm dashed #c8c8c8;outline-offset:.4mm}
        .a4n{font:600 12px/1.6 inherit;color:#888;text-align:center}
        @media print{.a4wrap{display:block}.a4{box-shadow:none;break-after:page;page-break-after:always}.a4:last-child{break-after:auto;page-break-after:auto}.a4n{display:none}@page{size:A4;margin:6mm}}
      `}</style>
      {pages.map((cs, p) => (
        <div key={p}>
          <div className="a4n">ورقة {p + 1} من {pages.length} — {cs.length} ملصق</div>
          <div className="a4">{cs}</div>
        </div>
      ))}
    </div>
  );
}
