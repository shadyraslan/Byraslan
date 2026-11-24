"use server";
import { revalidatePath } from "next/cache";
import { deny } from "@/lib/perms";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";

const back = () => revalidatePath("/accounts/money");

export async function saveAccount(p: Record<string, string | boolean | null>): Promise<Result<{ id: number }>> {
  { const g = await deny("money.manage"); if (g) return g; }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("money_account_save", { p });
  if (error) return { ok: false, error: dbMsg(error.message) };
  back(); return { ok: true, id: Number(data) };
}

export async function moveMoney(acc: number, kind: "in" | "out", amount: number, note: string): Promise<Result<{ no: number }>> {
  { const g = await deny("money.move"); if (g) return g; }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("money_move", { p_acc: acc, p_kind: kind, p_amount: amount, p_note: note });
  if (error) return { ok: false, error: dbMsg(error.message) };
  back(); return { ok: true, no: Number(data) };
}

export async function transferMoney(from: number, to: number, amount: number, fee: number, note: string): Promise<Result<{ no: number }>> {
  { const g = await deny("money.move"); if (g) return g; }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("money_transfer", { p_from: from, p_to: to, p_amount: amount, p_fee: fee, p_note: note });
  if (error) return { ok: false, error: dbMsg(error.message) };
  back(); return { ok: true, no: Number(data) };
}

export async function reverseMove(id: number, note: string): Promise<Result<{ done: true }>> {
  { const g = await deny("money.manage"); if (g) return g; }
  const sb = await supabaseServer();
  const { error } = await sb.rpc("money_reverse", { p_move: id, p_note: note });
  if (error) return { ok: false, error: dbMsg(error.message) };
  back(); return { ok: true, done: true };
}
