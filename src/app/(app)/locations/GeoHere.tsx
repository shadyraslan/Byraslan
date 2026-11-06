"use client";
/** بيحط إحداثيات المكان اللي واقف فيه دلوقتي في خانة الموقع (افتح الشاشة من الموبايل وانت في الفرع) */
export default function GeoHere() {
  return (
    <button type="button" className="btn" style={{ height: 32 }} title="افتحها من الموبايل وانت واقف في المكان"
      onClick={(e) => {
        const form = (e.currentTarget as HTMLButtonElement).form;
        const inp = form?.elements.namedItem("geo") as HTMLInputElement | null;
        if (!navigator.geolocation || !inp) return alert("الموبايل ده مش بيدّي الموقع");
        navigator.geolocation.getCurrentPosition(
          (p) => { inp.value = `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`; inp.focus(); },
          () => alert("اسمح بالموقع للمتصفح وجرّب تاني"), { enableHighAccuracy: true, timeout: 15000 });
      }}>📍 مكاني</button>
  );
}
