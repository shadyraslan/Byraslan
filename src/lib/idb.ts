"use client";
// مخزن صغير على الجهاز (IndexedDB) — بيفضل موجود حتى لو المتصفح اتقفل أو النت قطع
const DB = "byraslan-cashier";
let dbp: Promise<IDBDatabase> | null = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
export async function get<T>(k: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((res, rej) => { const q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result as T | undefined); q.onerror = () => rej(q.error); });
}
export async function set(k: string, v: unknown): Promise<void> {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
export async function del(k: string): Promise<void> {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
