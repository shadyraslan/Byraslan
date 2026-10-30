import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { grant, revoke } from "./actions";

export default async function Users() {
  const me = await getMe();
  const sb = await supabaseServer();
  const [{ data: users }, { data: perms }, { data: grants }] = await Promise.all([
    sb.from("profiles").select("id,name,is_owner").order("name"),
    sb.from("permissions").select("id,grp,label").order("grp"),
    sb.from("grants").select("user_id,perm,until,max_amount,granted_by"),
  ]);
  const edit = can(me, "users.manage");
  const grps = [...new Set((perms ?? []).map((p) => p.grp))];
  return (
    <>
      <div className="top"><h1>المستخدمين والصلاحيات</h1></div>
      <div className="note" style={{ marginBottom: 14 }}>أي صلاحية من صلاحيات المالك تقدر تديها لأي حد، لمدة أو بحد مبلغ. المستخدم الجديد بيتعمل من Supabase ← Authentication ← Add user، وبعدين يظهر هنا.</div>
      {(users ?? []).map((u) => {
        const mine = (grants ?? []).filter((g) => g.user_id === u.id);
        return (
          <div key={u.id} className="card">
            <h2>{u.name} {u.is_owner && <span className="pill">المالك — كل الصلاحيات</span>}</h2>
            {!u.is_owner && (
              <>
                <div className="row" style={{ marginBottom: 8 }}>
                  {mine.map((g) => (
                    <form key={g.perm} action={revoke} style={{ display: "inline" }}>
                      <input type="hidden" name="user_id" value={u.id} /><input type="hidden" name="perm" value={g.perm} />
                      <span className="pill">{(perms ?? []).find((p) => p.id === g.perm)?.label ?? g.perm}{g.until ? ` — لحد ${g.until}` : ""} {edit && <button className="btn" style={{ height: 22, padding: "0 6px" }}>×</button>}</span>
                    </form>
                  ))}
                  {!mine.length && <span className="muted">مالوش صلاحيات</span>}
                </div>
                {edit && (
                  <form action={grant} className="row">
                    <input type="hidden" name="user_id" value={u.id} />
                    <label className="fld">صلاحية<select name="perm">{grps.map((g) => <optgroup key={g} label={g}>{(perms ?? []).filter((p) => p.grp === g).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>)}</select></label>
                    <label className="fld">لحد (اختياري)<input type="date" name="until" /></label>
                    <label className="fld">حد المبلغ (اختياري)<input name="max_amount" inputMode="decimal" style={{ width: 110 }} /></label>
                    <button className="btn pri">اديها</button>
                  </form>
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
