"use client";
export default function PrintBtn() {
  return <button className="btn pri noprint" onClick={() => window.print()} style={{ position: "fixed", top: 16, left: 16 }}>🖨️ اطبع</button>;
}
