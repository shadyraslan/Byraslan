/** رسم أعمدة بسيط (سلسلة واحدة): أعمدة رفيعة بأطراف مدوّرة، شبكة باهتة، وقيمة كل عمود في الـ tooltip */
export default function Bars({ data, color = "#E2B000", unit = "", height = 180 }: { data: { label: string; v: number }[]; color?: string; unit?: string; height?: number }) {
  const W = 640, H = height, pad = { t: 14, r: 8, b: 26, l: 8 };
  const max = Math.max(1, ...data.map((d) => d.v));
  const n = Math.max(1, data.length), slot = (W - pad.l - pad.r) / n, bw = Math.min(28, slot * 0.6);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const fmt = (v: number) => Math.round(v).toLocaleString("en");
  const last = data[data.length - 1];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`آخر ${n} يوم`}>
      {[0.5, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" strokeOpacity=".08" />)}
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity=".2" />
      {data.map((d, i) => {
        const x = pad.l + slot * i + (slot - bw) / 2, h = Math.max(d.v > 0 ? 3 : 0, y(0) - y(d.v));
        return (
          <g key={i}>
            <rect className="bar" x={x} y={y(0) - h} width={bw} height={h} rx={4} fill={color}><title>{`${d.label}: ${fmt(d.v)}${unit}`}</title></rect>
            {(i % Math.ceil(n / 7) === 0 || i === n - 1) && <text x={x + bw / 2} y={H - 8} textAnchor="middle">{d.label}</text>}
          </g>
        );
      })}
      {last && last.v > 0 && <text x={pad.l + slot * (n - 1) + slot / 2} y={y(last.v) - 5} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 700 }}>{fmt(last.v)}</text>}
    </svg>
  );
}
