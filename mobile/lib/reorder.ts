import { router } from "expo-router";
import { useApp } from "./store";

// إعادة الطلب بالسعر الحالي، واللي مش متاح مابيتضافش
export function useReorder() {
  const { menu, setQty, clearCart } = useApp();
  return (o: { lines: { item_id: number; qty: number }[] }) => {
    clearCart();
    o.lines.forEach((l) => { const m = (menu ?? []).find((x) => x.item_id === l.item_id); if (m && m.available > 0) setQty(l.item_id, Number(l.qty)); });
    router.push("/cart");
  };
}

