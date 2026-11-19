"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import SettleBox from "@/components/SettleBox";

export default function SettleRow({ customerId, balance }: { customerId: number; balance: number }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  if (!open) return <button className="btn" style={{ height: 30, justifySelf: "start" }} onClick={() => setOpen(true)}>سجّل تسوية</button>;
  return <SettleBox customerId={customerId} balance={balance} onDone={() => setTimeout(() => router.refresh(), 1200)} />;
}
