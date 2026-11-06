"use client";
import { supabaseBrowser } from "@/lib/supabase/client";

/** يصغّر الصورة ويرفعها على Storage (docs) ويرجّع المسار */
export async function uploadPhoto(file: File, folder: string, max = 1400): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.75));
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await supabaseBrowser().storage.from("docs").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  return path;
}

/** لينك مؤقت لصورة على Storage */
export async function photoUrl(path: string, bucket = "docs"): Promise<string | null> {
  const { data } = await supabaseBrowser().storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
